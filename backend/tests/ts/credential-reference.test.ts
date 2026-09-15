import test from "node:test";
import assert from "node:assert/strict";
import {
  CredentialError,
  type CredentialReference,
  assertSameProvider,
  isNoneRef,
  noneCredentialReference,
  redactSecret,
  sameRef,
} from "../../security/credential-reference.js";

test("CredentialReference carries no secret-value field", () => {
  const ref: CredentialReference = {
    credentialId: "cred-1",
    providerId: "openai",
    source: "environment",
    scope: "process",
    envVarName: "OPENAI_API_KEY",
  };
  assert.equal(Object.hasOwn(ref, "apiKey"), false);
  assert.equal(Object.hasOwn(ref, "secret"), false);
  assert.equal(Object.hasOwn(ref, "token"), false);
  assert.equal(Object.hasOwn(ref, "value"), false);
});

test("isNoneRef is true only for source 'none'", () => {
  assert.equal(
    isNoneRef(noneCredentialReference("ollama")),
    true,
  );
  assert.equal(
    isNoneRef({
      credentialId: "e",
      providerId: "openai",
      source: "environment",
      scope: "process",
      envVarName: "OPENAI_API_KEY",
    }),
    false,
  );
});

test("sameRef compares identity fields, not secrets", () => {
  const a: CredentialReference = {
    credentialId: "c",
    providerId: "p",
    source: "session",
    scope: "principal",
    ownerId: "u1",
  };
  const b: CredentialReference = { ...a };
  const c: CredentialReference = { ...a, ownerId: "u2" };
  assert.equal(sameRef(a, b), true);
  assert.equal(sameRef(a, c), false);
});

test("assertSameProvider rejects cross-provider use (correction #9)", () => {
  const ref: CredentialReference = {
    credentialId: "c",
    providerId: "openai",
    source: "environment",
    scope: "process",
    envVarName: "OPENAI_API_KEY",
  };
  assertSameProvider(ref, "openai"); // ok, does not throw
  assert.throws(
    () => assertSameProvider(ref, "groq"),
    (e: unknown) => {
      assert.ok(e instanceof CredentialError);
      assert.equal((e as CredentialError).code, "CREDENTIAL_INVALID_REFERENCE");
      return true;
    },
  );
});

test("redactSecret never returns the raw value", () => {
  assert.equal(redactSecret("super-secret-value"), "set");
  assert.equal(redactSecret(""), "unset");
  assert.equal(redactSecret(undefined), "unset");
  assert.equal(redactSecret(null), "unset");
});

test("CredentialError carries a machine-readable code, never a secret", () => {
  const e = new CredentialError("CREDENTIAL_NOT_FOUND", "OPENAI_API_KEY is not set");
  assert.equal(e.code, "CREDENTIAL_NOT_FOUND");
  assert.match(e.message, /CREDENTIAL_NOT_FOUND/);
});
