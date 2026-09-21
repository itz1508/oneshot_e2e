import asyncio
import pytest

from evaluation_middleware import (
    EvaluationMiddleware,
    EvaluationRequest,
    MultimodalObservation,
    MultimodalReadiness,
)
from evaluation_middleware.adapters.multimodal import (
    CosmosMultimodalEvidenceAdapter,
    DeterministicMultimodalEvidenceAdapter,
)


def test_deterministic_adapter_is_ready():
    a = DeterministicMultimodalEvidenceAdapter()
    assert a.readiness() is MultimodalReadiness.READY


def test_deterministic_adapter_returns_registered_observation():
    obs = MultimodalObservation(
        observationId="ss-1", modality="image", summary="ui screenshot",
        providerLabel="deterministic",
    )
    a = DeterministicMultimodalEvidenceAdapter(fixtures={"ss-1": obs})
    got = asyncio.run(a.describe("ss-1"))
    assert got is obs
    # Unknown reference → None (never fabricated)
    assert asyncio.run(a.describe("unknown")) is None


def test_cosmos_adapter_not_installed_returns_none():
    a = CosmosMultimodalEvidenceAdapter(scriptedReadiness=MultimodalReadiness.NOT_INSTALLED)
    assert a.readiness() is MultimodalReadiness.NOT_INSTALLED
    assert asyncio.run(a.describe("anything")) is None


def test_cosmos_adapter_hardware_unsupported_returns_none():
    a = CosmosMultimodalEvidenceAdapter(scriptedReadiness=MultimodalReadiness.HARDWARE_UNSUPPORTED)
    assert a.readiness() is MultimodalReadiness.HARDWARE_UNSUPPORTED
    assert asyncio.run(a.describe("anything")) is None


def test_cosmos_adapter_model_unavailable_returns_none():
    a = CosmosMultimodalEvidenceAdapter(scriptedReadiness=MultimodalReadiness.MODEL_UNAVAILABLE)
    assert asyncio.run(a.describe("anything")) is None


def test_middleware_records_unavailability_but_continues():
    """Fallback discipline: NOT_INSTALLED / HARDWARE_UNSUPPORTED both continue."""
    from evaluation_middleware import EvaluationItem
    for readiness in (
        MultimodalReadiness.NOT_INSTALLED,
        MultimodalReadiness.HARDWARE_UNSUPPORTED,
        MultimodalReadiness.MODEL_UNAVAILABLE,
        MultimodalReadiness.CONFIG_REQUIRED,
    ):
        mw = EvaluationMiddleware(
            multimodalAdapter=CosmosMultimodalEvidenceAdapter(scriptedReadiness=readiness),
        )
        r = EvaluationRequest(
            evaluationId=f"c-{readiness.value}", targetId="t",
            requirements=(
                EvaluationItem(itemId="r", kind="requirement", summary="", required=True),
            ),
        )
        receipt = asyncio.run(mw.evaluate(r))
        # Deterministic evaluation still ran
        assert len(receipt.requirementResults) == 1
        # Limitation was recorded
        joined = "|".join(receipt.limitations)
        assert "MULTIMODAL_ADAPTER_UNAVAILABLE" in joined
        assert readiness.value in joined


def test_ready_cosmos_returns_only_proof_mode_placeholder():
    a = CosmosMultimodalEvidenceAdapter(scriptedReadiness=MultimodalReadiness.READY)
    got = asyncio.run(a.describe("ref-1"))
    assert got is not None
    # Even in READY, this proof does not install Cosmos → the branch
    # returns a placeholder classified as MODEL_DERIVED_VISUAL_OBSERVATION.
    assert got.evidenceClass.value == "MODEL_DERIVED_VISUAL_OBSERVATION"
    assert "proof-mode" in got.summary
