from __future__ import annotations
import importlib.util
import json
import sys
from pathlib import Path
from .schema_validator import SchemaStore
from .triple_validation import (
    assert_routing,
    run_triple,
    validate_fixture,
    validate_goal,
    validate_schema,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
ROOT = Path(__file__).resolve().parents[4]
STORE = SchemaStore(ROOT / 'backend/schema')


def _skill_registry():
    path = ROOT / 'backend/skills/oneshot-canonical-contracts/tool/registry.py'
    spec = importlib.util.spec_from_file_location('oneshot_skill_registry', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('cannot load canonical Skill registry')
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod.build_tool_registry(ROOT)


SKILL = _skill_registry()


def _triple_inputs(payload: dict):
    return (
        payload['plan'],
        payload['validation'],
        payload['schema_artifact'],
        payload['fixture'],
        payload['goal'],
    )


def handle(cmd: str, payload: dict):
    if cmd == 'skill-tools':
        return {'tools': list(SKILL.names())}
    if cmd == 'skill-tool':
        return SKILL.invoke(payload['tool'], payload.get('input') or {})

    if cmd == 'triple-routing':
        plan, validation, schema_artifact, fixture, goal = _triple_inputs(payload)
        assert_routing(plan, validation, schema_artifact, fixture, goal)
        return {'valid': True}

    if cmd == 'schema-validation':
        plan, validation, schema_artifact, fixture, goal = _triple_inputs(payload)
        out = validate_schema(plan, schema_artifact, STORE)
        STORE.assert_valid('urn:oneshot:schema:schema-validation:1', out)
        return out

    if cmd == 'fixture-validation':
        plan, validation, schema_artifact, fixture, goal = _triple_inputs(payload)
        graph = json.loads((ROOT / 'backend/workflow/graph.json').read_text())
        out = validate_fixture(
            plan,
            fixture,
            validation['fixture_validation']['assertion_ids'],
            STORE,
            graph,
        )
        STORE.assert_valid('urn:oneshot:schema:fixture-validation:1', out)
        return out

    if cmd == 'goal-validation':
        plan, validation, schema_artifact, fixture, goal = _triple_inputs(payload)
        out = validate_goal(
            plan,
            goal,
            validation['goal_validation']['criterion_ids'],
        )
        STORE.assert_valid('urn:oneshot:schema:goal-validation:1', out)
        return out

    if cmd == 'triple-validation':
        plan, validation, schema_artifact, fixture, goal = _triple_inputs(payload)
        graph = json.loads((ROOT / 'backend/workflow/graph.json').read_text())
        out = run_triple(
            plan,
            validation,
            schema_artifact,
            fixture,
            goal,
            STORE,
            graph,
        )
        for contract_id, key in [
            ('urn:oneshot:schema:schema-validation:1', 'schema_validation'),
            ('urn:oneshot:schema:fixture-validation:1', 'fixture_validation'),
            ('urn:oneshot:schema:goal-validation:1', 'goal_validation'),
        ]:
            STORE.assert_valid(contract_id, out[key])
        STORE.assert_valid('urn:oneshot:schema:triple-validation:1', out)
        return out

    # compatibility aliases for deterministic scripts/tests
    aliases = {
        'validate-artifact': 'validate_artifact',
        'validate-references': 'validate_references',
        'create-hash': 'create_hash',
        'verify-hash': 'verify_hash',
    }
    if cmd in aliases:
        return SKILL.invoke(aliases[cmd], payload)
    if cmd == 'verify-static':
        registry = SKILL.invoke('validate_registry', {})
        graph = SKILL.invoke('validate_graph', {})
        errors = [*registry.get('errors', []), *graph.get('errors', [])]
        return {'valid': not errors, 'errors': errors}
    if cmd == 'triple':
        return handle('triple-validation', payload)
    raise ValueError(f'unknown command: {cmd}')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    payload = json.load(sys.stdin)
    json.dump(handle(cmd, payload), sys.stdout, separators=(',', ':'))
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
