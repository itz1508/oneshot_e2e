import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { SkillCatalog } from "../backend/skill/catalog.js";
import { SkillRegistry } from "../backend/skill/registry.js";
import { SkillResolver } from "../backend/skill/resolver.js";
import { SkillActivationEngine } from "../backend/skill/activation.js";
import { createSkillSystem } from "../backend/skill/bootstrap.js";
import { PythonBridge } from "../backend/validation/python-bridge.js";

test("dynamic Skill Catalog discovers skill directories on disk and indexes capabilities", () => {
  const catalog = new SkillCatalog();
  const discovered = catalog.discover(resolve("."));

  assert.ok(discovered.length >= 5);
  assert.ok(catalog.has("oneshot-canonical-contracts"));
  assert.ok(catalog.has("oneshot-task-runtime"));
  assert.ok(catalog.has("oneshot-intent-collection"));
  assert.ok(catalog.has("oneshot-sandbox-runtime"));
  assert.ok(catalog.has("oneshot-init"));

  // Capabilities index lookup
  const contractSkills = catalog.findByCapability("canonical-contracts");
  assert.equal(contractSkills.length, 1);
  assert.equal(contractSkills[0].skill_id, "oneshot-canonical-contracts");

  const initSkills = catalog.findByCapability("init");
  assert.equal(initSkills.length, 1);
  assert.equal(initSkills[0].skill_id, "oneshot-init");

  // Tool reverse lookup
  const toolSkill = catalog.findByTool("validate_schema");
  assert.ok(toolSkill);
  assert.equal(toolSkill.skill_id, "oneshot-canonical-contracts");
});

test("SkillResolver enforces strict exact capability matching and rejects fuzzy substitutions", () => {
  const catalog = new SkillCatalog();
  const resolver = new SkillResolver(catalog);

  // Exact positive match
  const matchId = resolver.resolveExact({ skill_id: "oneshot-init" });
  assert.equal(matchId.resolved, true);
  assert.equal(matchId.skill_id, "oneshot-init");

  const matchCap = resolver.resolveExact({ capability: "sandbox-runtime" });
  assert.equal(matchCap.resolved, true);
  assert.equal(matchCap.skill_id, "oneshot-sandbox-runtime");

  const matchTool = resolver.resolveExact({ tool: "project_run" });
  assert.equal(matchTool.resolved, true);
  assert.equal(matchTool.skill_id, "oneshot-task-runtime");

  // Negative: Non-existent / fuzzy capability must NOT resolve
  const fuzzy = resolver.resolveExact({ capability: "task_runner_approximate" });
  assert.equal(fuzzy.resolved, false);
  assert.match(fuzzy.reason || "", /No exact Skill matching capability/i);

  const missingId = resolver.resolveExact({ skill_id: "oneshot-nonexistent" });
  assert.equal(missingId.resolved, false);
});

test("SkillResolver supports governed resolveOrCreate pathway without fuzzy fallback", () => {
  const catalog = new SkillCatalog();
  const resolver = new SkillResolver(catalog);

  const custom = resolver.resolveOrCreate("custom-linter", (cap) => ({
    skill_id: "oneshot-custom-linter",
    name: "Custom Code Linter",
    path: "skill/custom-linter/SKILL.md",
    capabilities: [cap],
    responsibilities: ["lint source code"],
    tools: ["lint_file"],
  }));

  assert.equal(custom.resolved, true);
  assert.equal(custom.skill_id, "oneshot-custom-linter");

  // Now resolvable by exact capability
  const resolved = resolver.resolveExact({ capability: "custom-linter" });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.skill_id, "oneshot-custom-linter");
});

test("SkillActivationEngine activates reusable Skill, binds tool surface, and tracks lifecycle", async () => {
  const system = createSkillSystem();

  // Activate oneshot-init
  const active = await system.activation.activate(
    { capability: "init" },
    { caller_id: "operator:test" },
  );

  assert.equal(active.skill_id, "oneshot-init");
  assert.equal(active.caller_id, "operator:test");
  assert.ok(active.definitions().some((d) => d.name === "check_preflight"));

  // Invoke tool through activated handle
  const preflight = await active.invoke<any>("check_preflight", {});
  assert.equal(preflight.healthy, true);
  assert.ok(preflight.checks.length >= 2);

  // Check registry activation records
  const activations = system.registry.getActivations("oneshot-init");
  assert.equal(activations.length, 1);
  assert.equal(activations[0].state, "ACTIVE");

  // Deactivate
  await active.deactivate();
  assert.equal(activations[0].state, "DEACTIVATED");
});

test("Caller/Role composes canonical-contracts skill through activation engine", async () => {
  const system = createSkillSystem();
  const bridge = new PythonBridge();

  try {
    const active = await system.activation.activate(
      { skill_id: "oneshot-canonical-contracts" },
      { caller_id: "role:Researcher", bridge },
    );

    assert.equal(active.skill_id, "oneshot-canonical-contracts");
    assert.equal(active.caller_id, "role:Researcher");

    // Invoke canonicalize tool
    const res = await active.invoke<{ canonical_utf8: string }>("canonicalize", {
      value: { b: 2, a: 1 },
    });
    assert.equal(res.canonical_utf8, '{"a":1,"b":2}');

    await active.deactivate();
  } finally {
    bridge.close();
  }
});
