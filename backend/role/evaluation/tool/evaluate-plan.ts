import type { Evaluation, Plan, ResearchBundle } from "../../../contract/types.js";
import { detectGaps } from "../../gap-analysis/tool/coverage.js";
export const EVALUATION_AREAS=["research alignment","requirement coverage","dependency coherence","plan coherence","goal traceability","success-criteria traceability","fixture traceability","schema traceability","execution meaning"] as const;
export function evaluatePlan(bundle:ResearchBundle,plan:Plan):Evaluation{
  const evidenceIds=bundle.researcher.evidence.map(e=>e.evidence_id),gaps=detectGaps(bundle,plan),failed:string[]=[];const entries:Evaluation["evidence"]=[];
  const add=(subject:string,ok:boolean,detail:string)=>{entries.push({check_id:`evaluation:${subject.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}`,subject,finding:ok?`complete: ${detail}`:`incomplete: ${detail}`,evidence_ids:evidenceIds});if(!ok)failed.push(subject);};
  const researchOk=bundle.researcher.plan_id===plan.plan_id&&bundle.researcher.researcher_id===plan.researcher_id&&bundle.researcher.requirement_ids.every(id=>plan.requirements.some(r=>r.requirement_id===id)); add("research alignment",researchOk,"Researcher identities and requirements align to plan");
  add("requirement coverage",!gaps.some(g=>g.affected_branch==="requirement"),"Every researched requirement maps to a plan step");
  const reqIds=new Set(plan.requirements.map(r=>r.requirement_id));add("dependency coherence",plan.dependencies.every(d=>d.required_by.every(x=>reqIds.has(x))),"Dependencies resolve to researched requirements");
  const stepIds=new Set(plan.steps.map(s=>s.step_id));add("plan coherence",plan.steps.every(s=>s.depends_on.every(d=>stepIds.has(d)&&d!==s.step_id)),"Step dependencies resolve without self-reference");
  add("goal traceability",!gaps.some(g=>g.affected_branch==="goal"),"Every goal criterion maps to plan steps");
  const goalCriteria=new Set(bundle.goal.success_criteria.map(c=>c.criterion_id));add("success-criteria traceability",bundle.researcher.success_definition.success_criteria_ids.every(x=>goalCriteria.has(x)),"Researcher success criteria resolve to Goal criteria");
  const fixtureIds=new Set(bundle.fixture.plan_assertions.map(a=>a.assertion_id));add("fixture traceability",bundle.validation.fixture_validation.assertion_ids.every(x=>fixtureIds.has(x))&&!gaps.some(g=>g.affected_branch==="fixture"),"Routed fixture assertions exist and map to plan");
  add("schema traceability",bundle.schema_artifact.target==="plan"&&!gaps.some(g=>g.affected_branch==="schema"),"Researcher schema targets plan and is referenced");
  add("execution meaning",plan.steps.length>0&&plan.steps.every(s=>s.responsibility.trim().length>0),"Every plan step names an execution responsibility");
  if(!failed.length)return {plan_id:plan.plan_id,result:"PASSED",evidence:entries};
  return {plan_id:plan.plan_id,result:"ROOT_CAUSE",evidence:entries,root_cause:{issue:"Evaluation found incomplete canonical evidence areas",expected:EVALUATION_AREAS.join(", "),actual:failed.join(", "),evidence_ids:evidenceIds,required_correction:"Correct the failed Evaluation areas",recheck_target:plan.plan_id}};
}
