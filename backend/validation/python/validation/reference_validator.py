from __future__ import annotations

def validate_references(core:dict)->list[str]:
    e=[]
    r,p,s,f,g,v,a,ga,ev,t=[core[k] for k in ['researcher','plan','schema_artifact','fixture','goal','validation','audit','gap_analysis','evaluation','triple_validation']]
    def eq(label,x,y):
        if x!=y:e.append(f'{label}: {x!r} != {y!r}')
    eq('researcher.plan_id',r['plan_id'],p['plan_id']);eq('plan.researcher_id',p['researcher_id'],r['researcher_id'])
    eq('schema_id',r['schema_id'],s['schema_id']);eq('schema.researcher_id',s['researcher_id'],r['researcher_id'])
    if s.get('target')!='plan':e.append(f"schema.target: {s.get('target')!r} != 'plan'")
    eq('fixture_id',r['fixture_id'],f['fixture_id']);eq('fixture.researcher_id',f['researcher_id'],r['researcher_id'])
    eq('goal_id',r['goal_id'],g['goal_id']);eq('goal.researcher_id',g['researcher_id'],r['researcher_id'])
    eq('validation_id',r['validation_id'],v['validation_id']);eq('validation.plan_id',v['plan_id'],p['plan_id']);eq('validation.researcher_id',v['researcher_id'],r['researcher_id'])
    for key in ('schema_validation','fixture_validation','goal_validation'):eq(f'validation.{key}.plan_id',v[key]['plan_id'],p['plan_id'])
    eq('validation.schema_id',v['schema_validation']['schema_id'],s['schema_id']);eq('validation.fixture_id',v['fixture_validation']['fixture_id'],f['fixture_id']);eq('validation.goal_id',v['goal_validation']['goal_id'],g['goal_id'])
    assertion_ids={x['assertion_id'] for x in f['plan_assertions']};criterion_ids={x['criterion_id'] for x in g['success_criteria']}
    missing_assert=[x for x in v['fixture_validation']['assertion_ids'] if x not in assertion_ids]
    missing_criteria=[x for x in v['goal_validation']['criterion_ids'] if x not in criterion_ids]
    if missing_assert:e.append(f'validation assertion_ids unresolved: {missing_assert}')
    if missing_criteria:e.append(f'validation criterion_ids unresolved: {missing_criteria}')
    eq('audit.plan_id',a['plan_id'],p['plan_id']);eq('audit.researcher_id',a['researcher_id'],r['researcher_id'])
    eq('gap.plan_id',ga['plan_id'],p['plan_id']);eq('evaluation.plan_id',ev['plan_id'],p['plan_id']);eq('triple.plan_id',t['plan_id'],p['plan_id']);eq('triple.validation_id',t['validation_id'],v['validation_id'])
    eq('schema validation plan',t['schema_validation']['plan_id'],p['plan_id']);eq('schema validation id',t['schema_validation']['schema_id'],s['schema_id'])
    eq('fixture validation plan',t['fixture_validation']['plan_id'],p['plan_id']);eq('fixture validation id',t['fixture_validation']['fixture_id'],f['fixture_id'])
    eq('goal validation plan',t['goal_validation']['plan_id'],p['plan_id']);eq('goal validation id',t['goal_validation']['goal_id'],g['goal_id'])
    expected=all(t[k]['result']=='VALID' for k in ['schema_validation','fixture_validation','goal_validation']);eq('triple.all_valid',t['all_valid'],expected)
    if not ga['gap_0']:e.append('gap_0 is not true')
    if ev['result']!='PASSED':e.append('evaluation is not PASSED')
    if not expected:e.append('triple validation is not all VALID')
    return e
