import test from "node:test";
import assert from "node:assert/strict";
import {
  DispatchingCredentialResolver,
  EnvironmentCredentialResolver,
  InMemorySessionCredentialStore,
  SecretStoreReferenceResolver,
} from "../../security/credential-resolver.js";
import {
  CredentialError,
  type CredentialReference,
  noneCredentialReference,
} from "../../security/credential-reference.js";

const openaiEnvRef = (envVarName = "OPENAI_API_KEY"): CredentialReference => ({
  credentialId: "c-openai",
  providerId: "openai",
  source: "environment",
  scope: "process",
  envVarName,
});

test("environment resolver reads only approved env vars and returns the value", async () => {
  const r = new EnvironmentCredentialResolver({ OPENAI_API_KEY: "sk-test" });
  assert.equal(await r.resolve(openaiEnvRef()), "sk-test");
});

test("environment resolver rejects an arbitrary env var name for a custom provider (no arbitrary env access)", async () => {
  const r = new EnvironmentCredentialResolver({ PATH: "/usr/bin" });
  const customRef: CredentialReference = {
    credentialId: "c-custom",
    providerId: "mycustom",
    source: "environment",
    scope: "process",
    envVarName: "PATH",
  };
  await assert.rejects(
    () => r.resolve(customRef),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_INVALID_REFERENCE");
      return true;
    },
  );
});

test("environment resolver ignores envVarName for built-in providers (always uses the approved name)", async () => {
  // A browser cannot redirect a built-in provider to an arbitrary env var by
  // setting envVarName; the approved built-in name is always used.
  const r = new EnvironmentCredentialResolver({ PATH: "/usr/bin" });
  await assert.rejects(
    () =>
      r.resolve({ ...openaiEnvRef(), envVarName: "PATH" } as CredentialReference),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_NOT_FOUND");
      return true;
    },
  );
});

test("environment resolver throws CREDENTIAL_NOT_FOUND when the approved var is unset", async () => {
  const r = new EnvironmentCredentialResolver({});
  await assert.rejects(
    () => r.resolve(openaiEnvRef()),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_NOT_FOUND");
      return true;
    },
  );
});

test("describe never returns the secret value", () => {
  const r = new EnvironmentCredentialResolver({ OPENAI_API_KEY: "sk-secret" });
  const d = r.describe(openaiEnvRef());
  assert.equal(d.state, "set");
  assert.equal(d.source, "environment");
  assert.equal(Object.hasOwn(d, "value"), false);
});

test("session store set/get with expiry", () => {
  let now = 1000;
  const store = new InMemorySessionCredentialStore(() => now);
  const ref: CredentialReference = {
    credentialId: "cs",
    providerId: "openai",
    source: "session",
    scope: "principal",
    ownerId: "u1",
  };
  store.set(ref, "sk-sess", 5000);
  assert.equal(store.get(ref), "sk-sess");
  now = 7000; // expired
  assert.throws(
    () => store.get(ref),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_NOT_FOUND");
      return true;
    },
  );
});

test("session store rejects cross-provider use (provider ownership)", () => {
  const store = new InMemorySessionCredentialStore();
  const ref: CredentialReference = {
    credentialId: "cs",
    providerId: "openai",
    source: "session",
    scope: "principal",
    ownerId: "u1",
  };
  store.set(ref, "sk-sess", 60000);
  const otherProvider: CredentialReference = { ...ref, providerId: "groq" };
  assert.throws(
    () => store.get(otherProvider),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_INVALID_REFERENCE");
      return true;
    },
  );
});

test("session store rejects access by a different owner", () => {
  const store = new InMemorySessionCredentialStore();
  const ref: CredentialReference = {
    credentialId: "cs",
    providerId: "openai",
    source: "session",
    scope: "principal",
    ownerId: "u1",
  };
  store.set(ref, "sk-sess", 60000);
  const otherOwner: CredentialReference = { ...ref, ownerId: "u2" };
  assert.throws(
    () => store.get(otherOwner),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
});

test("session store rejects process-scope references", () => {
  const store = new InMemorySessionCredentialStore();
  const ref: CredentialReference = {
    credentialId: "cp",
    providerId: "openai",
    source: "session",
    scope: "process",
  };
  assert.throws(
    () => store.set(ref, "x", 1000),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_INVALID_REFERENCE");
      return true;
    },
  );
});

test("secret-store resolver fails closed (correction #7)", async () => {
  const r = new SecretStoreReferenceResolver();
  const ref: CredentialReference = {
    credentialId: "ss",
    providerId: "openai",
    source: "secret-store",
    scope: "process",
    secretStoreRef: "vault/openai",
  };
  await assert.rejects(
    () => r.resolve(ref),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_RESOLVER_UNAVAILABLE");
      return true;
    },
  );
});

test("only source 'none' resolves to empty string without error", async () => {
  const r = new DispatchingCredentialResolver(
    new EnvironmentCredentialResolver({}),
    new InMemorySessionCredentialStore(),
    new SecretStoreReferenceResolver(),
  );
  assert.equal(await r.resolve(noneCredentialReference("ollama")), "");
});

test("dispatcher resolves environment via the env resolver", async () => {
  const r = new DispatchingCredentialResolver(
    new EnvironmentCredentialResolver({ OPENAI_API_KEY: "sk-disp" }),
    new InMemorySessionCredentialStore(),
    new SecretStoreReferenceResolver(),
  );
  assert.equal(await r.resolve(openaiEnvRef()), "sk-disp");
});
