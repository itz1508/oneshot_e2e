from __future__ import annotations

REQUIRED_EDGES = {
    ('Prompt', 'Researcher', 'Prompt_id'),
    ('Researcher', 'Planner', 'plan_id'),
    ('Planner', 'Refactor', 'audit_id'),
    ('Refactor', 'GapAnalysis', 'plan_id'),
    ('GapAnalysis', 'GapCheck', 'plan_id'),
    ('GapCheck', 'GapFix', 'gaps_found'),
    ('GapCheck', 'GapAnalysisComplete', 'gap_0+plan_id'),
    ('GapFix', 'GapRecheck', 'plan_id'),
    ('GapRecheck', 'GapCheck', 'gaps_remaining'),
    ('GapRecheck', 'GapAnalysisComplete', 'gap_0+plan_id'),
    ('GapAnalysisComplete', 'Evaluation', 'gap_0+plan_id'),
    ('Evaluation', 'SchemaValidation', 'plan_id'),
    ('Evaluation', 'FixtureValidation', 'plan_id'),
    ('Evaluation', 'GoalValidation', 'plan_id'),
    ('Researcher', 'SchemaValidation', 'schema_id'),
    ('Researcher', 'FixtureValidation', 'fixture_id'),
    ('Researcher', 'GoalValidation', 'goal_id'),
    ('Researcher', 'TripleValidation', 'validation_id'),
    ('SchemaValidation', 'TripleValidation', 'schema_validation_result'),
    ('FixtureValidation', 'TripleValidation', 'fixture_validation_result'),
    ('GoalValidation', 'TripleValidation', 'goal_validation_result'),
    ('TripleValidation', 'Confirmed', 'triple_validation'),
    ('Confirmed', 'CreateHash', 'confirmed_package'),
    ('Confirmed', 'Builder', 'confirmed_package'),
    ('CreateHash', 'Builder', 'HASH'),
    ('CreateHash', 'Hash', 'HASH'),
    ('Builder', 'Hash', 'hash_sandbox'),
    ('Builder', 'Hash', 'build_result'),
    ('Hash', 'Done', 'verified_HASH'),
}

EXPECTED_VALIDATORS = {'SchemaValidation', 'FixtureValidation', 'GoalValidation'}
EXPECTED_GAP_LOOP = {'GapCheck', 'GapFix', 'GapRecheck'}
EXPECTED_SEQUENCE = [
    'Researcher',
    'Planner',
    'Refactor',
    'GapAnalysis',
    'Evaluation',
    'TripleValidation',
    'Confirmed',
    'CreateHash',
    'Builder',
    'Hash',
    'Done',
]


def validate_graph(graph: dict) -> list[str]:
    errors: list[str] = []
    nodes = [node['id'] for node in graph['nodes']]
    if len(nodes) != len(set(nodes)):
        errors.append('duplicate graph node')

    node_set = set(nodes)
    for edge in graph['edges']:
        if edge['from'] not in node_set or edge['to'] not in node_set:
            errors.append(f'unresolved edge {edge}')

    actual = {
        (edge['from'], edge['to'], edge['artifact'])
        for edge in graph['edges']
    }
    for edge in sorted(REQUIRED_EDGES - actual):
        errors.append(f'missing canonical edge {edge}')

    groups = {group['group_id']: group for group in graph.get('parallel_groups', [])}
    triple_group = groups.get('TripleValidation')
    if (
        not triple_group
        or set(triple_group['members']) != EXPECTED_VALIDATORS
        or triple_group['join'] != 'TripleValidation'
    ):
        errors.append('TripleValidation group mismatch')

    workflow_agents = {
        agent['id']: agent for agent in graph.get('workflow_agents', [])
    }
    root = workflow_agents.get('OneShotCanonicalWorkflow')
    if (
        not root
        or root.get('type') != 'SequentialAgent'
        or root.get('members') != EXPECTED_SEQUENCE
    ):
        errors.append('OneShotCanonicalWorkflow SequentialAgent mismatch')

    gap_loop = workflow_agents.get('GapAnalysisLoop')
    if (
        not gap_loop
        or gap_loop.get('type') != 'LoopAgent'
        or set(gap_loop.get('members', [])) != EXPECTED_GAP_LOOP
        or gap_loop.get('exit') != 'GapAnalysisComplete'
    ):
        errors.append('GapAnalysisLoop workflow-agent mismatch')

    triple_parallel = workflow_agents.get('TripleValidationParallel')
    if (
        not triple_parallel
        or triple_parallel.get('type') != 'ParallelAgent'
        or set(triple_parallel.get('members', [])) != EXPECTED_VALIDATORS
        or triple_parallel.get('join') != 'TripleValidation'
    ):
        errors.append('TripleValidationParallel workflow-agent mismatch')

    owners = {
        item['artifact']: item['owner']
        for item in graph['artifact_ownership']
    }
    expected_owners = {
        'plan_id': 'Researcher',
        'schema_id': 'Researcher',
        'fixture_id': 'Researcher',
        'goal_id': 'Researcher',
        'validation_id': 'Researcher',
        'audit_id': 'Planner',
        'gap_0': 'GapAnalysis',
        'HASH': 'CreateHash',
        'build_result': 'Builder',
        'execution_evidence': 'Builder',
        'hash_sandbox': 'Builder',
        'hash_proof': 'Hash',
    }
    for artifact, owner in expected_owners.items():
        if owners.get(artifact) != owner:
            errors.append(
                f'ownership mismatch {artifact}: {owners.get(artifact)} != {owner}'
            )

    if str(graph.get('version')) != '2':
        errors.append(f"workflow graph version {graph.get('version')!r} != '2'")

    return errors
