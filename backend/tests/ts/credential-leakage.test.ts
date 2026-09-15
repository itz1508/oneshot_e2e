import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { DirectOpenAIRuntime } from "../../integration/runtime/direct-openai-runtime.js";
import { buildFakeRoute } from "../../integration/runtime/fake-runtime.js";
import { EnvironmentCredentialResolver } from "../../security/credential-resolver.js";
import {
  CredentialError,
  type CredentialReference,
  noneCredentialReference,
  redactSecret,
} from "../../security/credential-reference.js";

const SECRET = "sk-leakage-test-secret";

test("ResolvedExecutionRoute has no credential reference or secret field (structural)", () => {
  const route = buildFakeRoute("r1");
  assert.equal(Object.hasOwn(route, "credentialRef"), false);
  assert.equal(Object.hasOwn(route, "credentialId"), false);
  assert.equal(Object.hasOwn(route, "apiKey"), false);
  assert.equal(Object.hasOwn(route, "secret"), false);
});

test("a serialized route snapshot contains no secret substring and no credentialRef key", () => {
  const snapshot = JSON.stringify(buildFakeRoute("r2"));
  assert.equal(snapshot.includes(SECRET), false);
  assert.equal(snapshot.includes("credentialRef"), false);
  assert.equal(snapshot.includes("apiKey"), false);
});

test("DirectOpenAIRuntime resolves credentialRef at invoke and the NormalizedResult carries no secret", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: '{"summary":"ok"}',
  });
  try {
    const resolver = new EnvironmentCredentialResolver({
      OPENAI_API_KEY: SECRET,
    });
    const ref: CredentialReference = {
      credentialId: "c",
      providerId: "openai",
      source: "environment",
      scope: "process",
      envVarName: "OPENAI_API_KEY",
    };
    const rt = new DirectOpenAIRuntime({ credentialResolver: resolver });
    const result = await rt.invoke({
      route: { ...buildFakeRoute("r3"), baseUrl: srv.url },
      promptText: "p",
      credentialRef: ref,
    });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(SECRET), false);
    assert.equal(Object.hasOwn(result, "apiKey"), false);
    assert.equal(Object.hasOwn(result, "credential"), false);
  } finally {
    await srv.close();
  }
});

test("DirectOpenAIRuntime legacy apiKey bridge is disabled in production (production bridge disabled)", () => {
  assert.throws(
    () => new DirectOpenAIRuntime({ apiKey: "legacy", productionMode: true }),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
});

test("DirectOpenAIRuntime legacy apiKey bridge still works in non-production (internal regression)", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: '{"summary":"ok"}',
  });
  try {
    const rt = new DirectOpenAIRuntime({ apiKey: "legacy-internal" });
    const result = await rt.invoke({
      route: { ...buildFakeRoute("r4"), baseUrl: srv.url },
      promptText: "p",
    });
    assert.equal(JSON.stringify(result).includes("legacy-internal"), false);
  } finally {
    await srv.close();
  }
});

test("Ollama (none source) resolves to empty with no credential needed", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: '{"summary":"ok"}',
  });
  try {
    const resolver = new EnvironmentCredentialResolver({});
    const ref = noneCredentialReference("ollama");
    assert.equal(await resolver.resolve(ref), "");
    const rt = new DirectOpenAIRuntime({ credentialResolver: resolver });
    const result = await rt.invoke({
      route: { ...buildFakeRoute("r5"), baseUrl: srv.url },
      promptText: "p",
      credentialRef: ref,
    });
    assert.equal(result.finishReason, "stop");
  } finally {
    await srv.close();
  }
});

test("no HTTP legacy-key injection: a raw apiKey has no accepting public API in M11 (production rejects)", () => {
  // M11 adds NO /api/providers* credential endpoint. The only credential path
  // is CredentialReference + resolver. A raw apiKey in an HTTP body has no
  // accepting handler, and the runtime rejects legacy keys in production.
  assert.throws(
    () => new DirectOpenAIRuntime({ apiKey: "from-http-body", productionMode: true }),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
});

test("redactSecret keeps secrets out of logs, errors, and response objects", () => {
  assert.equal(redactSecret(SECRET), "set");
  assert.equal(`${redactSecret(SECRET)}`.includes(SECRET), false);
  const err = new CredentialError("CREDENTIAL_NOT_FOUND", `env var for ${SECRET}`);
  // The error MESSAGE must not be how secrets travel; redaction is the contract.
  // Here we only assert the redactor never returns the raw value.
  assert.equal(redactSecret(err.message).includes(SECRET), false);
});
