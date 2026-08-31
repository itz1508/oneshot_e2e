import type { ConfirmedPackage, HashProof } from "../contract/types.js";
import { CanonicalContractSkill } from "../skill/canonical-contract-skill.js";
export class HashWorkflow { constructor(private contracts:CanonicalContractSkill){} async run(confirmed:ConfirmedPackage):Promise<HashProof>{ const created=await this.contracts.createHash(confirmed.core); const proof=await this.contracts.verifyHash(confirmed.core,created); await this.contracts.validate("urn:oneshot:schema:hash-proof:1",proof); return proof; } }
