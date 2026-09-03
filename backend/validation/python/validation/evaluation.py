from __future__ import annotations

def evaluate_plan(plan:dict,goal:dict,researcher:dict|None=None,fixture:dict|None=None,schema_artifact:dict|None=None,validation:dict|None=None)->dict:
    evidence_ids=[x['evidence_id'] for x in (researcher or {}).get('evidence',[])] or ['evidence:evaluation']
    reqs={r['requirement_id'] for r in plan['requirements']};covered={x for s in plan['steps'] for x in s['requirement_refs']};criteria={c['criterion_id'] for c in goal['success_criteria']};goal_covered={x for s in plan['steps'] for x in s['goal_refs']};step_ids={s['step_id'] for s in plan['steps']};failed=[];evidence=[]
    def add(subject,ok,detail):
        evidence.append({'check_id':'evaluation:'+subject.replace(' ','-'),'subject':subject,'finding':('complete: ' if ok else 'incomplete: ')+detail,'evidence_ids':evidence_ids})
        if not ok:failed.append(subject)
    research_ok=True if researcher is None else researcher['plan_id']==plan['plan_id'] and researcher['researcher_id']==plan['researcher_id'] and set(researcher['requirement_ids']).issubset(reqs)
    add('research alignment',research_ok,'Researcher identities and requirements align to plan')
    add('requirement coverage',reqs.issubset(covered),'Every researched requirement maps to a plan step')
    add('dependency coherence',all(set(d['required_by']).issubset(reqs) for d in plan['dependencies']),'Dependencies resolve to researched requirements')
    add('plan coherence',all(all(x in step_ids and x!=s['step_id'] for x in s['depends_on']) for s in plan['steps']),'Step dependencies resolve without self-reference')
    add('goal traceability',criteria.issubset(goal_covered),'Every goal criterion maps to plan steps')
    research_criteria=set((researcher or {}).get('success_definition',{}).get('success_criteria_ids',criteria));add('success-criteria traceability',research_criteria.issubset(criteria),'Researcher success criteria resolve to Goal criteria')
    fixture_ids={a['assertion_id'] for a in (fixture or {}).get('plan_assertions',[])};routed_assert=set((validation or {}).get('fixture_validation',{}).get('assertion_ids',fixture_ids));fixture_refs={x for s in plan['steps'] for x in s['fixture_refs']};add('fixture traceability',routed_assert.issubset(fixture_ids) and routed_assert.issubset(fixture_refs),'Routed fixture assertions exist and map to plan')
    schema_ok=True if schema_artifact is None else schema_artifact.get('target')=='plan' and schema_artifact['schema_id'] in {x for s in plan['steps'] for x in s['schema_refs']};add('schema traceability',schema_ok,'Researcher schema targets plan and is referenced')
    add('execution meaning',bool(plan['steps']) and all(bool(s['responsibility'].strip()) for s in plan['steps']),'Every plan step names an execution responsibility')
    if failed:return {'plan_id':plan['plan_id'],'result':'ROOT_CAUSE','evidence':evidence,'root_cause':{'issue':'Evaluation evidence incomplete','expected':'All canonical Evaluation areas complete','actual':', '.join(failed),'evidence_ids':evidence_ids,'required_correction':'Correct failed Evaluation areas','recheck_target':plan['plan_id']}}
    return {'plan_id':plan['plan_id'],'result':'PASSED','evidence':evidence}
