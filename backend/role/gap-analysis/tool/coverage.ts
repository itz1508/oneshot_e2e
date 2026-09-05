import type { Plan, ResearchBundle } from "../../../contracts/schema/types.js";
export interface GapFinding { key:string; affected_branch:"requirement"|"goal"|"fixture"|"schema"; ref_id:string; target_step_id?:string }
export function detectGaps(bundle:ResearchBundle,plan:Plan):GapFinding[]{
  const out:GapFinding[]=[];const target=plan.steps[0]?.step_id;
  const req=new Set(plan.steps.flatMap(s=>s.requirement_refs));for(const r of plan.requirements)if(!req.has(r.requirement_id))out.push({key:`requirement:${r.requirement_id}`,affected_branch:"requirement",ref_id:r.requirement_id,target_step_id:target});
  const goals=new Set(plan.steps.flatMap(s=>s.goal_refs));for(const c of bundle.goal.success_criteria)if(!goals.has(c.criterion_id))out.push({key:`goal:${c.criterion_id}`,affected_branch:"goal",ref_id:c.criterion_id,target_step_id:target});
  const fixtures=new Set(plan.steps.flatMap(s=>s.fixture_refs));for(const aid of bundle.validation.fixture_validation.assertion_ids)if(!fixtures.has(aid))out.push({key:`fixture:${aid}`,affected_branch:"fixture",ref_id:aid,target_step_id:target});
  const schemas=new Set(plan.steps.flatMap(s=>s.schema_refs));if(!schemas.has(bundle.schema_artifact.schema_id))out.push({key:`schema:${bundle.schema_artifact.schema_id}`,affected_branch:"schema",ref_id:bundle.schema_artifact.schema_id,target_step_id:target});
  return out;
}
export function remainingGaps(bundle:ResearchBundle,plan:Plan):string[]{return detectGaps(bundle,plan).map(x=>x.key);}
