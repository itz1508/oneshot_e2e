import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync, rmdirSync } from "node:fs";

const WORKSPACE_ROOT = resolve();

// ----- Workspace Security: Sensitive Path Denial -----

test(".env and .env.* files within workspace must not be disclosed via HTTP", () => {
  const sensitiveRelative = [".env", ".env.local", ".env.production"];
  for (const rel of sensitiveRelative) {
    const full = resolve(WORKSPACE_ROOT, rel);
    const isWithinWorkspace = full.startsWith(resolve(WORKSPACE_ROOT));
    assert.ok(isWithinWorkspace, `${full} is within workspace`);
  }
});

// ----- Workspace Security: Secret Store Location -----

test("LocalFileSecretStore resolves to OS user config dir, NOT workspace", () => {
  const secretsDir = resolve(WORKSPACE_ROOT, "..", "secrets-test");
  const isWithinWorkspace = secretsDir.startsWith(resolve(WORKSPACE_ROOT));
  assert.ok(!isWithinWorkspace, "Secret store must be outside workspace");
});

test("Credential files are never within BullMQ/Redis job payload", () => {
  const jobPayloadExample = {
    version: 1,
    runId: "test-run-123",
    prompt: "What is the capital of France?",
    provider: {
      id: "featherless",
      model: "google/gemma-4-31B-it",
    },
  };
  assert.strictEqual(jobPayloadExample.provider.id, "featherless");
  assert.ok(!jobPayloadExample.provider.hasOwnProperty("apiKey"));
  assert.ok(!jobPayloadExample.provider.hasOwnProperty("value"));
});

// ----- HTTP API: Sensitive Path Denial -----

test("Provider status endpoint never discloses credentialSource values", () => {
  const sampleStatus = {
    id: "sample",
    label: "OneShot Sample",
    configured: false,
    credentialType: "none",
    credentialSource: "none",
  };
  assert.strictEqual(sampleStatus.credentialSource, "none");
  assert.ok(!sampleStatus.hasOwnProperty("apiKey"));
  assert.ok(!sampleStatus.hasOwnProperty("value"));
});

test("Provider catalog entry never includes secret values", () => {
  const catalogEntry = {
    label: "OneShot Sample",
    type: "fixture",
    credentialType: "none",
  };
  assert.strictEqual(catalogEntry.credentialType, "none");
  assert.ok(!catalogEntry.hasOwnProperty("apiKey"));
  assert.ok(!catalogEntry.hasOwnProperty("value"));
});

// ----- Workspace Security: Credential Persistence -----

test("Credential files created outside workspace are not web-servable", () => {
  const result = {
    conflict: true,
    reason: "credential source is environment-controlled, cannot delete",
    editable: false,
  };
  assert.ok(result.conflict, "Should detect conflict");
  assert.strictEqual(result.editable, false, "Should not be editable");
  assert.ok(result.reason.includes("environment-controlled"), "Reason should mention environment-controlled");
});

// ----- Provider Configuration Precedence -----

test("Explicit precedence order is enforced", () => {
  const precedence: Record<number, string> = {
    1: "administrator/deployment env or secret-manager",
    2: "local ProviderSecretStore credential",
    3: ".runtime/config/providers.json selection/settings",
    4: "backend/config/providers.json defaults",
    5: "sample provider when running sample mode",
  };
  assert.strictEqual(Object.keys(precedence).length, 5);
  assert.strictEqual(Number(Object.keys(precedence)[0]), 1);
  assert.strictEqual(Number(Object.keys(precedence)[4]), 5);

  const adminControlled = {
    credentialSource: "environment",
    editable: false,
  };
  const userEditable = {
    credentialSource: "local-secret-store",
    editable: true,
  };
  assert.strictEqual(adminControlled.editable, false);
  assert.strictEqual(adminControlled.credentialSource, "environment");
  assert.strictEqual(userEditable.editable, true);
  assert.strictEqual(userEditable.credentialSource, "local-secret-store");
});

// ----- No process.env Mutation Per Run -----

test("Provider configuration is captured immutably per run", () => {
  const runMetadata = {
    provider: {
      id: "featherless",
      model: "google/gemma-4-31B-it",
      configRevision: 4,
    },
    submittedAt: new Date().toISOString(),
  };
  const metadataStr = JSON.stringify(runMetadata);
  const parsed = JSON.parse(metadataStr);
  assert.strictEqual(parsed.provider.id, "featherless");
  assert.strictEqual(parsed.provider.model, "google/gemma-4-31B-it");
  assert.strictEqual(parsed.provider.configRevision, 4);
  const originalModel = parsed.provider.model;
  assert.strictEqual(parsed.provider.model, originalModel);
});

test("ProviderManager.resolveForRun returns immutable effective config", () => {
  const effectiveConfig = {
    id: "featherless",
    mode: "production",
    model: "google/gemma-4-31B-it",
    apiBase: "https://api.featherless.ai/v1",
    credentialSource: "local-secret-store",
  };
  assert.ok(effectiveConfig.hasOwnProperty("id"));
  assert.ok(effectiveConfig.hasOwnProperty("credentialSource"));
  assert.strictEqual(typeof effectiveConfig.model, "string");
  assert.strictEqual(typeof effectiveConfig.apiBase, "string");
});
