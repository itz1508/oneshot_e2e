import type { Audit, ResearchBundle } from "../../contract/types.js";
import { id } from "../../core/id.js";
import { plannerFindings, PLANNER_REVIEW_AREAS } from "./tool/coverage.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
export class PlannerWorkflow { constructor(private contracts:CanonicalContractSkill){} async run(bundle:ResearchBundle,runId:string):Promise<Audit>{ const audit:Audit={audit_id:id("audit",runId),researcher_id:bundle.researcher.researcher_id,plan_id:bundle.plan.plan_id,reviewed_areas:[...PLANNER_REVIEW_AREAS],findings:plannerFindings(bundle)}; await this.contracts.validate("urn:oneshot:schema:audit:1",audit); return audit; } }
