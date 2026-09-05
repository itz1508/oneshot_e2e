from __future__ import annotations
from typing import Type
from pydantic import ValidationError
from .models import *

MODEL_BY_CONTRACT: dict[str, Type[StrictModel]] = {
 'urn:oneshot:schema:prompt:1': Prompt,
 'urn:oneshot:schema:researcher:1': Researcher,
 'urn:oneshot:schema:plan:1': Plan,
 'urn:oneshot:schema:schema-artifact:1': SchemaArtifact,
 'urn:oneshot:schema:fixture:1': Fixture,
 'urn:oneshot:schema:goal:1': Goal,
 'urn:oneshot:schema:validation:1': ValidationDefinition,
 'urn:oneshot:schema:audit:1': Audit,
 'urn:oneshot:schema:gap:1': GapAnalysis,
 'urn:oneshot:schema:evaluation:1': Evaluation,
 'urn:oneshot:schema:schema-validation:1': SchemaValidationResult,
 'urn:oneshot:schema:fixture-validation:1': FixtureValidationResult,
 'urn:oneshot:schema:goal-validation:1': GoalValidationResult,
 'urn:oneshot:schema:triple-validation:1': TripleValidation,
 'urn:oneshot:schema:confirmed-package:1': ConfirmedPackage,
 'urn:oneshot:schema:hash-proof:1': HashProof,
 'urn:oneshot:schema:workflow-graph:1': WorkflowGraph,
 'urn:oneshot:schema:contract-registry:1': ContractRegistry,
 'urn:oneshot:schema:sandbox-execution:1': SandboxExecutionInputModel,
 'urn:oneshot:schema:execution-evidence:1': ExecutionEvidenceModel,
}

def pydantic_accepts(contract_id: str, value) -> bool:
    model=MODEL_BY_CONTRACT[contract_id]
    try: model.model_validate(value); return True
    except ValidationError: return False

def prove_case(store, contract_id: str, value) -> dict:
    schema_ok = not store.validate(contract_id,value)
    runtime_ok = pydantic_accepts(contract_id,value)
    return {'schema_accepts':schema_ok,'runtime_accepts':runtime_ok,'parity':schema_ok==runtime_ok}
