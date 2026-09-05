import test from "node:test";
import assert from "node:assert/strict";
import { harness, prompt } from "./harness.js";
import { verifySandboxAdmission } from "../../sandbox/admission.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import type { SandboxExecutionInput } from "../../sandbox/types.js";

test("sandbox admission accepts authentic confirmed package and exact canonical HASH", async () => {
  const h = await harness("sandbox-admission-valid");
  const runId = "sbx-valid-1";
  h.runs.create(runId);

  const out = await h.runtime.run(runId, prompt(runId));
  assert.equal(out.result, "PASSED");
  assert.ok(out.hash_proof);

  const confirmedPackage = await h.store.load<any>(runId, "confirmed");
  const hash = out.hash_proof.created_hash;

  const input: SandboxExecutionInput = {
    confirmed_package: confirmedPackage,
    hash,
  };

  const admission = await verifySandboxAdmission(input, h.contracts);
  assert.equal(admission.valid, true);
  assert.equal(admission.equal, true);
  assert.equal(admission.recomputed_hash, hash);

  h.bridge.close();
});

test("sandbox admission rejects tampered package before execution starts", async () => {
  const h = await harness("sandbox-admission-tamper");
  const runId = "sbx-tamper-1";
  h.runs.create(runId);

  const out = await h.runtime.run(runId, prompt(runId));
  assert.equal(out.result, "PASSED");
  assert.ok(out.hash_proof);

  const confirmedPackage = await h.store.load<any>(runId, "confirmed");
  const originalHash = out.hash_proof.created_hash;

  // Tamper with plan content
  const tampered = structuredClone(confirmedPackage);
  tampered.core.plan.requirements[0].statement = "TAMPERED REQUIREMENT THAT MUST FAIL ADMISSION";

  const input: SandboxExecutionInput = {
    confirmed_package: tampered,
    hash: originalHash,
  };

  await assert.rejects(
    async () => verifySandboxAdmission(input, h.contracts),
    (err: any) => {
      assert.ok(err instanceof WorkflowRootCauseError);
      assert.match(err.rootCause.issue, /hash mismatch/i);
      assert.equal(err.rootCause.recheck_target, "sandbox admission");
      return true;
    },
  );

  h.bridge.close();
});

test("sandbox admission rejects malformed input and invalid hash formats", async () => {
  const h = await harness("sandbox-admission-malformed");

  // Invalid hash length / format
  const malformedHashInput: any = {
    confirmed_package: { confirmed: true, core: {} },
    hash: "truncated-16-hex",
  };

  await assert.rejects(
    async () => verifySandboxAdmission(malformedHashInput, h.contracts),
    (err: any) => {
      assert.ok(err instanceof WorkflowRootCauseError);
      assert.match(err.rootCause.issue, /Invalid canonical hash format/i);
      return true;
    },
  );

  // Missing confirmed package
  const missingCoreInput: any = {
    confirmed_package: { confirmed: false },
    hash: "a".repeat(64),
  };

  await assert.rejects(
    async () => verifySandboxAdmission(missingCoreInput, h.contracts),
    (err: any) => {
      assert.ok(err instanceof WorkflowRootCauseError);
      assert.match(err.rootCause.issue, /Malformed confirmed package/i);
      return true;
    },
  );

  h.bridge.close();
});
