import type { GapAnalysis, Plan, ResearchBundle } from "../../contract/types.js";
import { clone, unique } from "../../core/clone.js";
import { detectGaps } from "./tool/coverage.js";
import { CanonicalContractSkill } from "../../skill/canonical-contract-skill.js";
export class GapAnalysisWorkflow {
  constructor(private contracts:CanonicalContractSkill){}
  async run(bundle:ResearchBundle,input:Plan):Promise<{plan:Plan;gap:GapAnalysis}>{
    const p=clone(input),found=detectGaps(bundle,p),resolved:GapAnalysis["resolved_gaps"]=[],evidence=bundle.researcher.evidence.map(e=>e.evidence_id);
    for(const gap of found){
      const step=gap.target_step_id?p.steps.find(s=>s.step_id===gap.target_step_id):undefined;
      if(!step){const out:GapAnalysis={plan_id:p.plan_id,result:"ROOT_CAUSE",resolved_gaps:resolved,gap_0:false,root_cause:{issue:"Gap correction target unresolved",expected:`A plan branch for ${gap.key}`,actual:"No deterministic target step",evidence_ids:evidence,required_correction:"Provide a target plan branch",recheck_target:p.plan_id}};await this.contracts.validate("urn:oneshot:schema:gap:1",out);return {plan:p,gap:out};}
      if(gap.affected_branch==="requirement")step.requirement_refs=unique([...step.requirement_refs,gap.ref_id]);
      if(gap.affected_branch==="goal")step.goal_refs=unique([...step.goal_refs,gap.ref_id]);
      if(gap.affected_branch==="fixture")step.fixture_refs=unique([...step.fixture_refs,gap.ref_id]);
      if(gap.affected_branch==="schema")step.schema_refs=unique([...step.schema_refs,gap.ref_id]);
      resolved.push({gap_id:`gap:${gap.key}`,affected_branch:gap.affected_branch,issue:`Missing ${gap.key}`,evidence_ids:evidence,required_correction:`Add ${gap.ref_id} to ${gap.affected_branch} traceability`,expected_resolved_state:`${gap.key} is represented in plan steps`,resolution_evidence:`${gap.ref_id} added to ${step.step_id}`});
    }
    const remaining=detectGaps(bundle,p);const gap:GapAnalysis=remaining.length===0?{plan_id:p.plan_id,result:"PASSED",resolved_gaps:resolved,gap_0:true}:{plan_id:p.plan_id,result:"ROOT_CAUSE",resolved_gaps:resolved,gap_0:false,root_cause:{issue:"Gap Analysis fresh recheck still has unresolved gaps",expected:"No remaining identified gap",actual:remaining.map(x=>x.key).join(", "),evidence_ids:evidence,required_correction:"Resolve remaining plan branch gaps",recheck_target:p.plan_id}};
    await this.contracts.validate("urn:oneshot:schema:plan:1",p);await this.contracts.validate("urn:oneshot:schema:gap:1",gap);return {plan:p,gap};
  }
}
