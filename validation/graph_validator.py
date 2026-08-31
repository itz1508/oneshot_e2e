from __future__ import annotations
REQUIRED_EDGES={
 ('Prompt','Researcher','Prompt_id'),('Researcher','Planner','plan_id'),('Planner','Refactor','audit_id'),('Refactor','GapAnalysis','plan_id'),
 ('GapAnalysis','Evaluation','gap_0+plan_id'),('Evaluation','SchemaValidation','plan_id'),('Evaluation','FixtureValidation','plan_id'),('Evaluation','GoalValidation','plan_id'),
 ('SchemaValidation','TripleValidation','schema_validation_result'),('FixtureValidation','TripleValidation','fixture_validation_result'),('GoalValidation','TripleValidation','goal_validation_result'),
 ('TripleValidation','Confirmed','triple_validation'),('Confirmed','CreateHash','confirmed_package'),('CreateHash','Hash','HASH'),('Hash','Done','verified_HASH')}
EXPECTED_VALIDATORS={'SchemaValidation','FixtureValidation','GoalValidation'}

def validate_graph(graph: dict) -> list[str]:
    errors=[]; nodes=[n['id'] for n in graph['nodes']]
    if len(nodes)!=len(set(nodes)): errors.append('duplicate graph node')
    ns=set(nodes)
    for e in graph['edges']:
        if e['from'] not in ns or e['to'] not in ns: errors.append(f'unresolved edge {e}')
    actual={(e['from'],e['to'],e['artifact']) for e in graph['edges']}
    for e in sorted(REQUIRED_EDGES-actual): errors.append(f'missing canonical edge {e}')
    groups={g['group_id']:g for g in graph['parallel_groups']}
    tg=groups.get('TripleValidation')
    if not tg or set(tg['members'])!=EXPECTED_VALIDATORS or tg['join']!='TripleValidation': errors.append('TripleValidation group mismatch')
    owners={x['artifact']:x['owner'] for x in graph['artifact_ownership']}
    expected={'plan_id':'Researcher','schema_id':'Researcher','fixture_id':'Researcher','goal_id':'Researcher','validation_id':'Researcher','audit_id':'Planner','gap_0':'GapAnalysis','HASH':'CreateHash'}
    for a,o in expected.items():
        if owners.get(a)!=o: errors.append(f'ownership mismatch {a}: {owners.get(a)} != {o}')
    return errors
