import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemorySkillActivationStore,
  SkillConversationActivationGate,
} from "../../skills/conversation-activation.js";
import { SkillLoader } from "../../skills/loader.js";
import type {
  SkillActivationState,
  SkillDescriptor,
  SkillRuntimeBinding,
} from "../../skills/types.js";

const testDescriptor = (overrides?: Partial<SkillDescriptor>): SkillDescriptor => ({
  skill_id: "test-skill",
  name: "Test Skill",
  path: "backend/skills/test",
  capabilities: ["vision", "generate"],
  responsibilities: ["testing"],
  tools: ["test_tool"],
  groups: ["vision", "generate"],
  default_active: false,
  ...overrides,
});

const testBinding = (overrides?: Partial<SkillRuntimeBinding>): SkillRuntimeBinding => ({
  descriptor: testDescriptor(),
  available: true,
  async getTools() {
    return [
      { name: "test_tool", group: "vision", handler: async () => "ok" },
      { name: "test_tool_generate", group: "generate", handler: async () => "ok" },
    ];
  },
  ...overrides,
});

test("skills are inactive by default", async () => {
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  const descriptor = testDescriptor();

  const active = await gate.isActive(descriptor, "conv-1");
  assert.equal(active, false);
});

test("activation is scoped to conversation", async () => {
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  const descriptor = testDescriptor();

  await gate.activate(descriptor, "conv-1", undefined, ["vision"], "user");

  assert.equal(await gate.isActive(descriptor, "conv-1"), true);
  assert.equal(await gate.isActive(descriptor, "conv-2"), false);
});

test("run-scoped activation must match run id", async () => {
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  const descriptor = testDescriptor();

  await gate.activate(descriptor, "conv-1", "run-a", ["vision"], "user");

  assert.equal(await gate.isActive(descriptor, "conv-1", "run-a"), true);
  assert.equal(await gate.isActive(descriptor, "conv-1", "run-b"), false);
});

test("loader injects no tools when skill is inactive", async () => {
  const registry = new Map<string, SkillRuntimeBinding>([
    ["test-skill", testBinding()],
  ]);
  const gate = new SkillConversationActivationGate(new InMemorySkillActivationStore());
  const loader = new SkillLoader({ registry, gate });

  const loaded = await loader.load("conv-1");
  assert.equal(loaded.tools.length, 0);
  assert.equal(loaded.models.length, 0);
  assert.equal(loaded.active.length, 0);
});

test("loader injects tools only for active skills", async () => {
  const registry = new Map<string, SkillRuntimeBinding>([
    ["test-skill", testBinding()],
  ]);
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  const descriptor = testDescriptor();
  await gate.activate(descriptor, "conv-1", undefined, ["vision"], "user");

  const loader = new SkillLoader({ registry, gate });
  const loaded = await loader.load("conv-1");
  assert.equal(loaded.tools.length, 1);
  assert.equal(loaded.active.length, 1);
  assert.equal(loaded.active[0]?.skill_id, "test-skill");
});

test("activation rejects invalid groups", async () => {
  const gate = new SkillConversationActivationGate(new InMemorySkillActivationStore());
  const descriptor = testDescriptor();

  await assert.rejects(
    () => gate.activate(descriptor, "conv-1", undefined, ["action"] as never),
    /Invalid groups/,
  );
});

test("unavailable skills are never loaded", async () => {
  const registry = new Map<string, SkillRuntimeBinding>([
    ["test-skill", testBinding({ available: false })],
  ]);
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  await gate.activate(testDescriptor(), "conv-1", undefined, ["vision"], "user");

  const loader = new SkillLoader({ registry, gate });
  const loaded = await loader.load("conv-1");
  assert.equal(loaded.tools.length, 0);
});
