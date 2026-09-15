import test from "node:test";
import assert from "node:assert/strict";
import { createCredentialPolicy } from "../../security/credential-policy.js";
import { detectDeploymentPosture } from "../../security/deployment-posture.js";
import { UnauthenticatedContextProvider } from "../../security/authentication-context.js";
import {
  CredentialError,
  type CredentialReference,
} from "../../security/credential-reference.js";

const unauth = new UnauthenticatedContextProvider();

test("public-unauthed posture allows only environment + none", () => {
  const p = createCredentialPolicy(
    detectDeploymentPosture({ ONESHOT_BIND_HOST: "0.0.0.0" }),
    unauth,
  );
  assert.deepEqual([...p.allowedSources()], ["environment", "none"]);
  assert.equal(p.isPublicUnauthed(), true);
});

test("public-unauthed posture hard-denies session/secret-store storage (fail-closed)", () => {
  const p = createCredentialPolicy(
    detectDeploymentPosture({ ONESHOT_BIND_HOST: "0.0.0.0" }),
    unauth,
  );
  assert.throws(
    () => p.assertStorageAllowed("session"),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
  assert.throws(
    () => p.assertStorageAllowed("secret-store"),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
  p.assertStorageAllowed("environment"); // ok, no throw
  p.assertStorageAllowed("none"); // ok, no throw
});

test("public-unauthed posture hard-denies credential mutation", () => {
  const p = createCredentialPolicy(
    detectDeploymentPosture({ ONESHOT_BIND_HOST: "0.0.0.0" }),
    unauth,
  );
  assert.throws(
    () => p.assertMutationAllowed(),
    (e: unknown) => {
      assert.equal((e as CredentialError).code, "CREDENTIAL_DENIED");
      return true;
    },
  );
});

test("session storage requires loopback AND flag AND non-production (correction #2)", () => {
  const loopbackNoFlag = createCredentialPolicy(
    detectDeploymentPosture({
      ONESHOT_BIND_HOST: "127.0.0.1",
      ONESHOT_MODE: "development",
    }),
    unauth,
  );
  assert.equal(loopbackNoFlag.canStoreSessionCredential(), false);

  const loopbackFlagProd = createCredentialPolicy(
    detectDeploymentPosture({
      ONESHOT_BIND_HOST: "127.0.0.1",
      ONESHOT_LOCAL_CREDENTIAL_SESSION: "true",
      ONESHOT_MODE: "production",
    }),
    unauth,
  );
  assert.equal(loopbackFlagProd.canStoreSessionCredential(), false);

  const loopbackFlagDev = createCredentialPolicy(
    detectDeploymentPosture({
      ONESHOT_BIND_HOST: "127.0.0.1",
      ONESHOT_LOCAL_CREDENTIAL_SESSION: "true",
      ONESHOT_MODE: "development",
    }),
    unauth,
  );
  assert.equal(loopbackFlagDev.canStoreSessionCredential(), true);
  assert.ok(loopbackFlagDev.allowedSources().includes("session"));
});

test("assertCrossProvider rejects cross-provider use", () => {
  const p = createCredentialPolicy(
    detectDeploymentPosture({ ONESHOT_BIND_HOST: "127.0.0.1" }),
    unauth,
  );
  const ref: CredentialReference = {
    credentialId: "c",
    providerId: "openai",
    source: "environment",
    scope: "process",
    envVarName: "OPENAI_API_KEY",
  };
  p.assertCrossProvider(ref, "openai"); // ok
  assert.throws(() => p.assertCrossProvider(ref, "groq"));
});

test("loopback without flag is NOT public-unauthed and allows mutation", () => {
  const p = createCredentialPolicy(
    detectDeploymentPosture({
      ONESHOT_BIND_HOST: "127.0.0.1",
      ONESHOT_MODE: "development",
    }),
    unauth,
  );
  assert.equal(p.isPublicUnauthed(), false);
  assert.deepEqual([...p.allowedSources()], ["environment", "none"]);
  p.assertMutationAllowed(); // does not throw
});
