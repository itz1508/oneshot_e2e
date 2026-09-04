import type { Evaluation, Plan, ResearchBundle } from "../../contract/types.js";
import { evaluatePlan } from "./tool/evaluate-plan.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
export class EvaluationWorkflow { constructor(private contracts:CanonicalContractSkill){} async run(bundle:ResearchBundle,plan:Plan):Promise<Evaluation>{const e=evaluatePlan(bundle,plan);await this.contracts.validate("urn:oneshot:schema:evaluation:1",e);return e;} }
