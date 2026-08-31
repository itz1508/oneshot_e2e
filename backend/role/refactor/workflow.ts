import type { Audit, Plan, ResearchBundle } from "../../contract/types.js";
import { applyAudit } from "./tool/apply-audit.js";
import { CanonicalContractSkill } from "../../skill/canonical-contract-skill.js";
export class RefactorWorkflow { constructor(private contracts:CanonicalContractSkill){} async run(bundle:ResearchBundle,audit:Audit):Promise<Plan>{ const before=bundle.plan.plan_id;const p=applyAudit(bundle,audit);if(p.plan_id!==before)throw new Error("Refactor changed logical plan_id");await this.contracts.validate("urn:oneshot:schema:plan:1",p);return p; } }
