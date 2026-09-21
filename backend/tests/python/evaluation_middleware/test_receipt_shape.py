import asyncio
from dataclasses import fields

from evaluation_middleware import (
    EvaluationMiddleware,
    EvaluationReceipt,
    EvaluationRequest,
)


def test_receipt_has_every_required_field():
    r = EvaluationRequest(evaluationId="r", targetId="t")
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    field_names = {f.name for f in fields(receipt)}
    required = {
        "evaluationId", "targetId", "buildId", "planId",
        "startedAt", "completedAt", "evaluationStatus",
        "requiredComponentCount", "observedComponentCount",
        "satisfiedComponentCount", "partialComponentCount",
        "missingComponentCount", "unverifiedComponentCount",
        "blockedComponentCount",
        "requirementResults", "assertionResults",
        "goalSuccessResult", "outputQualityResult", "workflowResult",
        "missingComponents", "missingRequirements", "blockedRequirements",
        "evidenceReferences", "limitations", "evaluatorErrors",
        "cancellationStatus", "timeoutStatus", "recommendedDisposition",
    }
    missing = required - field_names
    assert not missing, f"receipt missing fields: {missing}"


def test_disposition_is_typed_enum():
    r = EvaluationRequest(evaluationId="r", targetId="t")
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    assert receipt.recommendedDisposition.value in {
        "READY_FOR_APPROVAL",
        "CORRECTION_REQUIRED",
        "MORE_EVIDENCE_REQUIRED",
        "BLOCKED",
        "CANCELLED",
    }
