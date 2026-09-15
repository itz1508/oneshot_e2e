import test from "node:test";
import assert from "node:assert/strict";
import { detectDeploymentPosture } from "../../security/deployment-posture.js";

test("loopback bind is not public-unauthed", () => {
  const p = detectDeploymentPosture({ ONESHOT_BIND_HOST: "127.0.0.1" });
  assert.equal(p.isLoopback, true);
  assert.equal(p.isPublicUnauthed, false);
});

test("non-loopback bind with no auth is public-unauthed", () => {
  const p = detectDeploymentPosture({ ONESHOT_BIND_HOST: "0.0.0.0" });
  assert.equal(p.isLoopback, false);
  assert.equal(p.isPublicUnauthed, true);
});

test("ONESHOT_REQUIRE_AUTH=true removes public-unauthed status", () => {
  const p = detectDeploymentPosture({
    ONESHOT_BIND_HOST: "0.0.0.0",
    ONESHOT_REQUIRE_AUTH: "true",
  });
  assert.equal(p.authPresent, true);
  assert.equal(p.isPublicUnauthed, false);
});

test("ONESHOT_MODE=production is detected as production", () => {
  assert.equal(
    detectDeploymentPosture({ ONESHOT_MODE: "production" }).isProduction,
    true,
  );
  assert.equal(
    detectDeploymentPosture({ ONESHOT_MODE: "development" }).isProduction,
    false,
  );
});

test("ONESHOT_LOCAL_CREDENTIAL_SESSION=true is detected", () => {
  const p = detectDeploymentPosture({
    ONESHOT_BIND_HOST: "127.0.0.1",
    ONESHOT_LOCAL_CREDENTIAL_SESSION: "true",
    ONESHOT_MODE: "development",
  });
  assert.equal(p.localCredentialSessionEnabled, true);
});

test("default posture (empty env) is public-unauthed (bind 0.0.0.0)", () => {
  const p = detectDeploymentPosture({});
  assert.equal(p.bindHost, "0.0.0.0");
  assert.equal(p.isPublicUnauthed, true);
});

test("loopback is NOT authentication: public-unauthed requires both no-auth AND non-loopback", () => {
  // loopback + no auth → NOT public-unauthed (loopback alone is not auth, but it is not "public")
  const p = detectDeploymentPosture({ ONESHOT_BIND_HOST: "localhost" });
  assert.equal(p.isLoopback, true);
  assert.equal(p.authPresent, false);
  assert.equal(p.isPublicUnauthed, false);
});
