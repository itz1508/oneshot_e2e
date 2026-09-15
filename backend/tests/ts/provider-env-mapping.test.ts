import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedEnvVarName,
  isApprovedEnvVarName,
} from "../../security/provider-env-mapping.js";

test("built-in providers map to explicitly approved env vars", () => {
  assert.equal(approvedEnvVarName("openai"), "OPENAI_API_KEY");
  assert.equal(approvedEnvVarName("groq"), "GROQ_API_KEY");
  assert.equal(approvedEnvVarName("tavily"), "TAVILY_API_KEY");
});

test("custom providers use only ONESHOT_PROVIDER_KEY_* names", () => {
  assert.equal(
    approvedEnvVarName("mycustom", "ONESHOT_PROVIDER_KEY_MYCUSTOM"),
    "ONESHOT_PROVIDER_KEY_MYCUSTOM",
  );
  assert.equal(approvedEnvVarName("mycustom", "ARBITRARY_SECRET"), undefined);
  assert.equal(approvedEnvVarName("mycustom"), undefined);
});

test("a browser-supplied arbitrary name is never approved (no arbitrary env access)", () => {
  assert.equal(isApprovedEnvVarName("OPENAI_API_KEY"), true);
  assert.equal(isApprovedEnvVarName("GROQ_API_KEY"), true);
  assert.equal(isApprovedEnvVarName("TAVILY_API_KEY"), true);
  assert.equal(isApprovedEnvVarName("ONESHOT_PROVIDER_KEY_ACME"), true);
  assert.equal(isApprovedEnvVarName("ONESHOT_PROVIDER_KEY_A1_B2"), true);
  // arbitrary / dangerous names are rejected
  assert.equal(isApprovedEnvVarName("PATH"), false);
  assert.equal(isApprovedEnvVarName("HOME"), false);
  assert.equal(isApprovedEnvVarName("DATABASE_URL"), false);
  assert.equal(isApprovedEnvVarName("NODE_OPTIONS"), false);
  assert.equal(isApprovedEnvVarName("ONESHOT_PROVIDER_KEY_"), false); // empty suffix
  assert.equal(isApprovedEnvVarName("ONESHOT_PROVIDER_KEY_acme"), false); // lowercase not allowed
});
