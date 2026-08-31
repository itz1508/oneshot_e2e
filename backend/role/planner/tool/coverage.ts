import type { AuditFinding, ResearchBundle } from "../../../contract/types.js";
export const PLANNER_REVIEW_AREAS=["evidence sufficiency","file or subject coverage","requirement coverage","dependency coverage","goal clarity","success criteria","fixture usability","schema applicability","validation traceability","plan structure","unresolved findings"] as const;
const evidenceIds=(b:ResearchBundle)=>b.researcher.evidence.map(e=>e.evidence_id);
const firstStep=(b:ResearchBundle)=>b.plan.steps[0]?.step_id;
export function plannerFindings(b:ResearchBundle):AuditFinding[]{
  const findings:AuditFinding[]=[];let n=0;const ev=evidenceIds(b);const step=firstStep(b);
  const add=(area:string,finding:string,refs:string[],refinement:string)=>findings.push({finding_id:`finding:${++n}:${area.replace(/\s+/g,"-")}`,area,finding,affected_plan_refs:refs,evidence_ids:ev,required_refinement:refinement});
  const knownEvidence=new Set(ev);
  for(const r of b.plan.requirements) for(const eid of r.evidence_ids) if(!knownEvidence.has(eid)) add("evidence sufficiency",`Requirement ${r.requirement_id} references unresolved evidence ${eid}`,[],`resolve evidence ${eid}`);
  if(!b.plan.steps.length) add("file or subject coverage","No plan step covers the researched subject",[],"create subject plan step");
  const reqRefs=new Set(b.plan.steps.flatMap(s=>s.requirement_refs)); for(const r of b.plan.requirements) if(!reqRefs.has(r.requirement_id)) add("requirement coverage",`Missing requirement reference ${r.requirement_id}`,step?[step]:[],`add requirement_refs ${r.requirement_id}`);
  const reqIds=new Set(b.plan.requirements.map(r=>r.requirement_id)); for(const d of b.plan.dependencies) for(const x of d.required_by) if(!reqIds.has(x)) add("dependency coverage",`Dependency ${d.dependency_id} required_by unresolved ${x}`,[],`resolve dependency ${d.dependency_id} required_by ${x}`);
  if(!b.goal.objective.trim()||!b.goal.success_meaning.trim()) add("goal clarity","Goal objective or success meaning is empty",[],"clarify goal before plan refinement");
  const criterionIds=b.goal.success_criteria.map(c=>c.criterion_id); const researchCriteria=new Set(b.researcher.success_definition.success_criteria_ids); for(const cid of criterionIds) if(!researchCriteria.has(cid)) add("success criteria",`Goal criterion ${cid} is absent from Researcher success definition`,[],`resolve success criterion ${cid}`);
  const fixtureIds=new Set(b.fixture.plan_assertions.map(a=>a.assertion_id)); for(const aid of b.validation.fixture_validation.assertion_ids) if(!fixtureIds.has(aid)) add("fixture usability",`Validation routes unresolved fixture assertion ${aid}`,[],`resolve fixture assertion ${aid}`);
  if(b.schema_artifact.target!=="plan") add("schema applicability",`Schema target ${b.schema_artifact.target} is not plan`,[],"set schema target plan");
  const schemaRefs=new Set(b.plan.steps.flatMap(s=>s.schema_refs)); if(!schemaRefs.has(b.schema_artifact.schema_id)) add("schema applicability",`Missing schema reference ${b.schema_artifact.schema_id}`,step?[step]:[],`add schema_refs ${b.schema_artifact.schema_id}`);
  const pid=b.plan.plan_id; const route=b.validation; const routeProblems=[route.plan_id,route.schema_validation.plan_id,route.fixture_validation.plan_id,route.goal_validation.plan_id].filter(x=>x!==pid); if(routeProblems.length) add("validation traceability",`Validation plan routing does not preserve ${pid}`,[],`resolve validation plan routing ${pid}`);
  if(route.schema_validation.schema_id!==b.schema_artifact.schema_id||route.fixture_validation.fixture_id!==b.fixture.fixture_id||route.goal_validation.goal_id!==b.goal.goal_id) add("validation traceability","Validation artifact routing does not resolve Researcher-owned proof artifacts",[],"resolve validation artifact routing");
  const stepIds=new Set(b.plan.steps.map(s=>s.step_id)); for(const s of b.plan.steps){ for(const dep of s.depends_on) if(!stepIds.has(dep)) add("plan structure",`Step ${s.step_id} depends on unresolved step ${dep}`,[],`resolve step dependency ${dep}`); }
  const goalRefs=new Set(b.plan.steps.flatMap(s=>s.goal_refs)); for(const cid of criterionIds) if(!goalRefs.has(cid)) add("unresolved findings",`Missing goal traceability ${cid}`,step?[step]:[],`add goal_refs ${cid}`);
  const fixtureRefs=new Set(b.plan.steps.flatMap(s=>s.fixture_refs)); for(const aid of b.validation.fixture_validation.assertion_ids) if(!fixtureRefs.has(aid)) add("unresolved findings",`Missing fixture traceability ${aid}`,step?[step]:[],`add fixture_refs ${aid}`);
  return findings;
}
