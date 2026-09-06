from __future__ import annotations
from typing import Type
from pydantic import ValidationError
from .models import *

MODEL_BY_CONTRACT: dict[str, Type[StrictModel]] = {
 'urn:oneshot:schema:prompt:2': Prompt,
 'urn:oneshot:schema:researcher:2': Researcher,
 'urn:oneshot:schema:plan:2': Plan,
 'urn:oneshot:schema:schema-artifact:2': SchemaArtifact,
 'urn:oneshot:schema:fixture:2': Fixture,
 'urn:oneshot:schema:goal:2': Goal,
 'urn:oneshot:schema:validation:2': ValidationDefinition,
 'urn:oneshot:schema:audit:2': Audit,
 'urn:oneshot:schema:gap:2': GapAnalysis,
 'urn:oneshot:schema:evaluation:2': Evaluation,
 'urn:oneshot:schema:schema-validation:2': SchemaValidationResult,
 'urn:oneshot:schema:fixture-validation:2': FixtureValidationResult,
 'urn:oneshot:schema:goal-validation:2': GoalValidationResult,
 'urn:oneshot:schema:triple-validation:2': TripleValidation,
 'urn:oneshot:schema:confirmed-package:2': ConfirmedPackage,
 'urn:oneshot:schema:hash-proof:2': HashProof,
 'urn:oneshot:schema:workflow-graph:2': WorkflowGraph,
 'urn:oneshot:schema:contract-registry:2': ContractRegistry,
 'urn:oneshot:schema:sandbox-execution:2': SandboxExecutionInputModel,
 'urn:oneshot:schema:execution-evidence:2': ExecutionEvidenceModel,
}

def pydantic_accepts(contract_id: str, value) -> bool:
    model=MODEL_BY_CONTRACT[contract_id]
    try: model.model_validate(value); return True
    except ValidationError: return False

def prove_case(store, contract_id: str, value) -> dict:
    schema_ok = not store.validate(contract_id,value)
    runtime_ok = pydantic_accepts(contract_id,value)
    return {'schema_accepts':schema_ok,'runtime_accepts':runtime_ok,'parity':schema_ok==runtime_ok}
