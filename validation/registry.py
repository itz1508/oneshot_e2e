from __future__ import annotations
import hashlib, json
from pathlib import Path
PRODUCER_CONSUMERS = {
    'common': ('ContractSystem', ['AllContracts']),
    'prompt': ('Prompt', ['Researcher']),
    'researcher': ('Researcher', ['Planner', 'TripleValidation']),
    'plan': ('Researcher', ['Planner', 'Refactor', 'GapAnalysis', 'Evaluation', 'SchemaValidation', 'FixtureValidation', 'GoalValidation']),
    'schema-artifact': ('Researcher', ['SchemaValidation']),
    'fixture': ('Researcher', ['FixtureValidation']),
    'goal': ('Researcher', ['GoalValidation']),
    'validation': ('Researcher', ['TripleValidation']),
    'audit': ('Planner', ['Refactor']),
    'gap': ('GapAnalysis', ['Evaluation']),
    'evaluation': ('Evaluation', ['SchemaValidation', 'FixtureValidation', 'GoalValidation']),
    'schema-validation': ('SchemaValidation', ['TripleValidation']),
    'fixture-validation': ('FixtureValidation', ['TripleValidation']),
    'goal-validation': ('GoalValidation', ['TripleValidation']),
    'triple-validation': ('TripleValidation', ['Confirmed']),
    'confirmed-package': ('Confirmed', ['CreateHash']),
    'hash-proof': ('Hash', ['Done']),
    'workflow-graph': ('WorkflowDefinition', ['WorkflowVerifier']),
    'contract-registry': ('ContractSystem', ['ContractResolver']),
    'sandbox-execution': ('OneShotControlPlane', ['ExternalSandbox']),
    'execution-evidence': ('ExternalSandbox', ['AuditStorage', 'TaskManagement']),
}

def build_registry(schema_dir: str|Path):
    sd=Path(schema_dir); contracts=[]
    for p in sorted(sd.glob('*.schema.json')):
        b=p.read_bytes(); s=json.loads(b); name=p.name[:-12]; prod,cons=PRODUCER_CONSUMERS[name]
        contracts.append({'contract_id':s['$id'],'version':'1','artifact_type':name,'schema_path':'schema/'+p.name,'schema_digest':hashlib.sha256(b).hexdigest(),'producer':prod,'consumers':cons})
    return {'registry_id':'oneshot-contract-registry','registry_version':'1','contracts':contracts}
