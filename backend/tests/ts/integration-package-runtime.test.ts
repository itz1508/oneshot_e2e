import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { integrationPackageSpec } from "../../integration/catalog.js";
import { integrationInstallCommand } from "../../integration/installer.js";
import {
  integrationDirectory,
  integrationStatus,
  loadIntegrationModel,
  loadIntegrationPackage,
} from "../../integration/runtime.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { PythonBridge } from "../../validation/python-bridge.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";

async function fakeGeminiInstall(root: string): Promise<string> {
  const target = integrationDirectory(root, "gemini");
  const packageRoot = join(target, "node_modules", "@ai-sdk", "google");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({ name: "@oneshot/runtime-integration-gemini", private: true }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@ai-sdk/google",
      version: "4.0.67",
      type: "module",
      exports: "./index.js",
    }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "index.js"),
    "export function createGoogleGenerativeAI(options) { return (model) => ({ model, options }); }\n",
    "utf8",
  );
  return target;
}

test("Gemini is a curated package install, not Core vendor code", () => {
  const spec = integrationPackageSpec("gemini");
  assert.equal(spec.packageName, "@ai-sdk/google");
  assert.equal(spec.factoryExport, "createGoogleGenerativeAI");
  assert.throws(() => integrationPackageSpec("../../arbitrary"), /unsupported integration/);
});

test("install command targets backend/integration/gemini and disables lifecycle scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-"));
  try {
    const target = integrationDirectory(root, "gemini");
    assert.equal(target, join(root, "backend", "integration", "gemini"));

    const command = integrationInstallCommand(root, "gemini");
    assert.deepEqual(command.args, [
      "install",
      "--prefix",
      target,
      "--ignore-scripts",
      "--save-exact",
      "@ai-sdk/google@4.0.67",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loader resolves the installed provider package from the integration folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-"));
  try {
    await fakeGeminiInstall(root);
    const loaded = await loadIntegrationPackage(root, "gemini");
    assert.equal(typeof loaded.createGoogleGenerativeAI, "function");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("model loader delegates Gemini implementation to the installed package", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-"));
  try {
    await fakeGeminiInstall(root);
    const model = (await loadIntegrationModel(root, "gemini", {
      model: "gemini-test-model",
      apiKey: "test-key",
      baseURL: "https://example.invalid/v1",
    })) as { model: string; options: { apiKey: string; baseURL: string } };

    assert.equal(model.model, "gemini-test-model");
    assert.deepEqual(model.options, {
      apiKey: "test-key",
      baseURL: "https://example.invalid/v1",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status is derived from actual folder contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-"));
  try {
    const before = await integrationStatus(root, integrationPackageSpec("gemini"));
    assert.equal(before.installed, false);

    await fakeGeminiInstall(root);
    const after = await integrationStatus(root, integrationPackageSpec("gemini"));
    assert.equal(after.installed, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ResearcherWorkflow fails with ROOT_CAUSE when no model capability is present (no fake fallback)", async () => {
  const bridge = new PythonBridge();
  const contracts = new CanonicalContractSkill(bridge);
  try {
    const researcher = new ResearcherWorkflow(contracts);
    await assert.rejects(
      async () => {
        await researcher.execute(
          {
            prompt_id: "prompt:test",
            intent: "Custom prompt that must not return static fixture",
            requested_outcome: "code",
            context: [{ context_id: "ctx:1", statement: "test" }],
            research_direction: ["requirements"],
          },
          "run:test-no-model",
        );
      },
      (err: any) => {
        assert.ok(err instanceof WorkflowRootCauseError);
        assert.equal(err.rootCause.issue, "RESEARCH_CAPABILITY_UNAVAILABLE");
        return true;
      },
    );
  } finally {
    bridge.close();
  }
});

test("ResearcherWorkflow accepts generic model draft capability and Researcher builds ResearchBundle", async () => {
  const bridge = new PythonBridge();
  const contracts = new CanonicalContractSkill(bridge);
  try {
    const capability = {
      model: {},
      source: "integration:test",
      provenance: "test@1.0.0",
      generateDraft: async () => ({
        summary: "Custom dynamic draft",
        requirements: ["Req 1: Parse input", "Req 2: Emit output"],
        dependencies: [{ description: "test dep", required_by: [0, 1] }],
        plan_steps: [
          { description: "Step 1", responsibility: "Builder", requirement_indexes: [0] },
          { description: "Step 2", responsibility: "Builder", requirement_indexes: [1] },
        ],
        success_meaning: "All criteria pass",
        success_criteria: [
          {
            statement: "Criterion 1",
            measurement: "assert",
            expected_result: "pass",
            requirement_indexes: [0, 1],
          },
        ],
      }),
    };
    const researcher = new ResearcherWorkflow(contracts, capability);
    const bundle = await researcher.execute(
      {
        prompt_id: "prompt:custom",
        intent: "Custom model test",
        requested_outcome: "code",
        context: [{ context_id: "ctx:1", statement: "test" }],
        research_direction: ["requirements"],
      },
      "run:test-custom-model",
    );

    assert.ok(bundle);
    assert.equal(bundle.researcher.researcher_id, "researcher:run:test-custom-model");
    assert.equal(bundle.plan.requirements.length, 2);
    assert.equal(bundle.plan.requirements[0].statement, "Req 1: Parse input");
    assert.equal(bundle.researcher.evidence[0].source, "integration:test");
  } finally {
    bridge.close();
  }
});

test("Root package.json does not require vendor SDKs", async () => {
  const rootPackageJson = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(rootPackageJson.dependencies?.["@ai-sdk/google"], undefined);
  assert.equal(rootPackageJson.dependencies?.["@ai-sdk/openai"], undefined);
  assert.equal(rootPackageJson.dependencies?.["@ai-sdk/anthropic"], undefined);
  assert.ok(rootPackageJson.dependencies?.["ai"], "ai package should remain at root");
});
