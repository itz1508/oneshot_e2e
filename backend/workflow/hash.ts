import type { ConfirmedPackage, HashProof } from "../contract/types.js";
import { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";

/** Canonical H1/H2 proof operations. */
export class HashWorkflow {
  constructor(private contracts: CanonicalContractSkill) {}

  /** H1 = SHA-256 of JCS canonical confirmed_package.core. */
  async create(confirmed: ConfirmedPackage): Promise<string> {
    return await this.contracts.createHash(confirmed.core);
  }

  /**
   * Prove the confirmation-side H1 equals the sandbox-side recomputation H2.
   * Both hashes intentionally cover the same immutable confirmed core.
   */
  async proof(
    createdHash: string,
    sandboxHash: string,
  ): Promise<HashProof> {
    const proof: HashProof = {
      canonicalization_id: "oneshot-jcs-rfc8785-v1",
      algorithm: "sha256",
      created_hash: createdHash,
      recomputed_hash: sandboxHash,
      equal: createdHash === sandboxHash,
    };
    await this.contracts.validate("urn:oneshot:schema:hash-proof:1", proof);
    return proof;
  }

  /** Compatibility path for direct non-Builder proof tests. */
  async run(confirmed: ConfirmedPackage): Promise<HashProof> {
    const created = await this.create(confirmed);
    const proof = await this.contracts.verifyHash(confirmed.core, created);
    await this.contracts.validate("urn:oneshot:schema:hash-proof:1", proof);
    return proof;
  }
}
