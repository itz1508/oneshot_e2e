import type { Audit, Plan, ResearchBundle } from "../../../contract/types.js";
import { clone, unique } from "../../../core/clone.js";
import { WorkflowRootCauseError } from "../../../core/root-cause-error.js";
function applyToStep(plan:Plan,stepId:string,field:"requirement_refs"|"goal_refs"|"fixture_refs"|"schema_refs",value:string):boolean{ const s=plan.steps.find(x=>x.step_id===stepId); if(!s)return false; const before=s[field].length;s[field]=unique([...s[field],value]);return s[field].length!==before; }
export function applyAudit(bundle:ResearchBundle,audit:Audit):Plan{
  const p=clone(bundle.plan);let changed=false;const applied=[] as typeof audit.findings;
  for(const f of audit.findings){
    const m=f.required_refinement.match(/^add (requirement_refs|goal_refs|fixture_refs|schema_refs) (.+)$/);
    if(!m||!f.affected_plan_refs.length) throw new WorkflowRootCauseError({issue:"Refactor cannot map Planner finding to plan",expected:"Every correction maps to affected_plan_refs",actual:`${f.finding_id}: ${f.required_refinement}`,evidence_ids:f.evidence_ids,required_correction:"Provide a deterministic affected plan reference and correction",recheck_target:audit.audit_id});
    const field=m[1] as "requirement_refs"|"goal_refs"|"fixture_refs"|"schema_refs"; const value=m[2]; let local=false;
    for(const ref of f.affected_plan_refs)local=applyToStep(p,ref,field,value)||local;
    if(!local && !p.steps.some(s=>f.affected_plan_refs.includes(s.step_id)&&s[field].includes(value))) throw new WorkflowRootCauseError({issue:"Refactor correction target unresolved",expected:`${value} mapped to ${field}`,actual:f.affected_plan_refs.join(", "),evidence_ids:f.evidence_ids,required_correction:"Correct affected_plan_refs",recheck_target:audit.audit_id});
    changed=local||changed;applied.push(f);
  }
  if(changed){p.revision+=1;p.revision_evidence.push(...applied.map(f=>({revision:p.revision,affected_area:f.affected_plan_refs.join(","),reason:f.required_refinement,audit_finding_id:f.finding_id})));}
  return p;
}
