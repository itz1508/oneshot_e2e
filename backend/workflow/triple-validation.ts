import type { Plan, ResearchBundle, TripleValidation } from "../contract/types.js";
import { CanonicalContractSkill } from "../skill/canonical-contract-skill.js";
import { DeterministicValidationRuntime } from "../validation/deterministic-validation.js";
export class TripleValidationWorkflow { constructor(private validation:DeterministicValidationRuntime,private contracts:CanonicalContractSkill){} async run(bundle:ResearchBundle,plan:Plan):Promise<TripleValidation>{const t=await this.validation.triple(bundle,plan);await this.contracts.validate("urn:oneshot:schema:triple-validation:1",t);return t;} }
