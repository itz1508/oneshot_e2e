import { createHash } from "node:crypto";
import type { HashProof } from "../contract/types.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import type { SandboxExecutionInput } from "./types.js";

/** Admission verification result. */
export interface SandboxAdmissionResult {
  valid: boolean;
  recomputed_hash: string;
  expected_hash: string;
  equal: boolean;
  proof?: HashProof;
}

/**
 * Validate incoming sandbox execution handoff.
 *
 * Requirements:
 * 1. Validate structure of confirmed_package and hash.
 * 2. Extract confirmed_package.core (the canonical comparable representation).
 * 3. Recompute canonical SHA-256 hash.
 * 4. Require recomputed_hash === input.hash.
 *
 * If unequal, execution must NOT start under any circumstances.
 */
export async function verifySandboxAdmission(
  input: SandboxExecutionInput,
  contracts?: CanonicalContractSkill,
): Promise<SandboxAdmissionResult> {
  if (!input || typeof input !== "object") {
    throw new WorkflowRootCauseError({
      issue: "Invalid sandbox execution input",
      expected: "SandboxExecutionInput object with confirmed_package and hash",
      actual: String(input),
      evidence_ids: ["sandbox-admission"],
      required_correction: "Provide valid SandboxExecutionInput",
      recheck_target: "sandbox admission",
    });
  }

  if (!input.confirmed_package || !input.confirmed_package.confirmed || !input.confirmed_package.core) {
    throw new WorkflowRootCauseError({
      issue: "Malformed confirmed package in sandbox handoff",
      expected: "confirmed_package with confirmed=true and core object",
      actual: JSON.stringify(input.confirmed_package),
      evidence_ids: ["sandbox-admission"],
      required_correction: "Provide a valid immutable confirmed package",
      recheck_target: "sandbox admission",
    });
  }

  if (!input.hash || typeof input.hash !== "string" || !/^[a-f0-9]{64}$/.test(input.hash)) {
    throw new WorkflowRootCauseError({
      issue: "Invalid canonical hash format in sandbox handoff",
      expected: "64-character lowercase hex SHA-256 string",
      actual: String(input.hash),
      evidence_ids: ["sandbox-admission"],
      required_correction: "Provide valid full 64-character SHA-256 canonical hash",
      recheck_target: "sandbox admission",
    });
  }

  let recomputed: string;
  let proof: HashProof | undefined;

  if (contracts) {
    proof = await contracts.verifyHash(input.confirmed_package.core, input.hash);
    recomputed = proof.recomputed_hash;
  } else {
    // If contracts skill not provided directly, verify core structure presence
    throw new Error("CanonicalContractSkill is required for sandbox admission verification");
  }

  if (recomputed !== input.hash || (proof && !proof.equal)) {
    throw new WorkflowRootCauseError({
      issue: "Execution handoff hash mismatch",
      expected: "Received HASH must equal the hash recomputed from the exact confirmed package",
      actual: `Recomputed hash (${recomputed}) differs from supplied HASH (${input.hash})`,
      evidence_ids: ["sandbox-admission", input.hash, recomputed],
      required_correction:
        "Reject the execution handoff and recover the original confirmed immutable package",
      recheck_target: "sandbox admission",
    });
  }

  return {
    valid: true,
    recomputed_hash: recomputed,
    expected_hash: input.hash,
    equal: true,
    proof,
  };
}
