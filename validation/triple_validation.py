from __future__ import annotations
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from .fixture_runner import run_fixture

def _evidence(eid,statement):return {'evidence_id':eid,'source':'deterministic-validator','statement':statement,'provenance':'runtime-proof'}
def _assert_routing(plan,validation,schema_artifact,fixture,goal):
    pid=plan['plan_id'];checks=[
      ('validation.plan_id',validation['plan_id'],pid),('schema_validation.plan_id',validation['schema_validation']['plan_id'],pid),
      ('fixture_validation.plan_id',validation['fixture_validation']['plan_id'],pid),('goal_validation.plan_id',validation['goal_validation']['plan_id'],pid),
      ('schema_id',validation['schema_validation']['schema_id'],schema_artifact['schema_id']),('fixture_id',validation['fixture_validation']['fixture_id'],fixture['fixture_id']),
      ('goal_id',validation['goal_validation']['goal_id'],goal['goal_id'])]
    bad=[f'{n}: {a!r} != {b!r}' for n,a,b in checks if a!=b]
    if schema_artifact.get('target')!='plan':bad.append(f"schema target {schema_artifact.get('target')!r} != 'plan'")
    if bad:raise ValueError('validation routing mismatch: '+'; '.join(bad))
def validate_schema(plan:dict,schema_artifact:dict,schema_store=None):
    try:
        Draft202012Validator.check_schema(schema_artifact['schema_document'])
        validator=Draft202012Validator(schema_artifact['schema_document'],registry=schema_store.registry if schema_store is not None else None)
        errors=[e.message for e in validator.iter_errors(plan)]
    except SchemaError as exc:errors=[f'invalid Draft 2020-12 schema document: {exc.message}']
    except Exception as exc:errors=[f'schema validation failure: {exc}']
    return {'plan_id':plan['plan_id'],'schema_id':schema_artifact['schema_id'],'result':'NOT_VALID' if errors else 'VALID','evidence':[_evidence('schema-proof','; '.join(errors) if errors else 'Plan satisfies Researcher-owned schema.')]}
def validate_fixture(plan:dict,fixture:dict,assertion_ids:list[str],schema_store=None,graph=None):
    results,ok=run_fixture(fixture,plan,schema_store,graph,assertion_ids)
    return {'plan_id':plan['plan_id'],'fixture_id':fixture['fixture_id'],'assertion_results':results,'result':'VALID' if ok else 'NOT_VALID','evidence':[_evidence('fixture-proof','All routed fixture assertions satisfied.' if ok else 'One or more routed fixture assertions failed.')]}
def validate_goal(plan:dict,goal:dict,criterion_ids:list[str]):
    by_id={c['criterion_id']:c for c in goal['success_criteria']};results=[]
    for cid in criterion_ids:
        refs=[s['step_id'] for s in plan['steps'] if cid in s.get('goal_refs',[])] if cid in by_id else []
        results.append({'criterion_id':cid,'mapped_plan_refs':refs,'satisfied':cid in by_id and bool(refs)})
    ok=all(x['satisfied'] for x in results)
    return {'plan_id':plan['plan_id'],'goal_id':goal['goal_id'],'criterion_results':results,'result':'VALID' if ok else 'NOT_VALID','evidence':[_evidence('goal-proof','Every routed success criterion maps to plan steps.' if ok else 'One or more routed success criteria are missing or unmapped.')]}
def run_triple(plan,validation,schema_artifact,fixture,goal,schema_store=None,graph=None):
    _assert_routing(plan,validation,schema_artifact,fixture,goal)
    s=validate_schema(plan,schema_artifact,schema_store);f=validate_fixture(plan,fixture,validation['fixture_validation']['assertion_ids'],schema_store,graph);g=validate_goal(plan,goal,validation['goal_validation']['criterion_ids'])
    all_valid=all(x['result']=='VALID' for x in (s,f,g))
    return {'plan_id':plan['plan_id'],'validation_id':validation['validation_id'],'schema_validation':s,'fixture_validation':f,'goal_validation':g,'all_valid':all_valid}
