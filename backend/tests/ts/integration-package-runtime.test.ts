import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
