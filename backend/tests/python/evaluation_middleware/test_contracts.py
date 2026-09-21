from evaluation_middleware import (
    EvidenceClass,
    MultimodalObservation,
    MultimodalReadiness,
    RecommendedDisposition,
    RequirementStatus,
)


def test_requirement_status_values():
    assert set(s.value for s in RequirementStatus) == {
        "SATISFIED",
        "PARTIALLY_SATISFIED",
        "MISSING",
        "UNVERIFIED",
        "NOT_APPLICABLE",
        "BLOCKED",
    }


def test_multimodal_observation_class_is_locked():
    obs = MultimodalObservation(
        observationId="obs-1",
        modality="image",
        summary="screenshot of build UI",
        providerLabel="deterministic",
    )
    assert obs.evidenceClass is EvidenceClass.MODEL_DERIVED_VISUAL_OBSERVATION


def test_multimodal_observation_rejects_other_evidence_class():
    import pytest
    with pytest.raises(ValueError):
        MultimodalObservation(
            observationId="obs-2",
            modality="image",
            summary="bad",
            providerLabel="x",
            evidenceClass=EvidenceClass.DETERMINISTIC,
        )


def test_disposition_enum_is_closed_set():
    assert set(d.value for d in RecommendedDisposition) == {
        "READY_FOR_APPROVAL",
        "CORRECTION_REQUIRED",
        "MORE_EVIDENCE_REQUIRED",
        "BLOCKED",
        "CANCELLED",
    }


def test_multimodal_readiness_enum():
    assert set(r.value for r in MultimodalReadiness) == {
        "NOT_INSTALLED",
        "CONFIG_REQUIRED",
        "MODEL_UNAVAILABLE",
        "HARDWARE_UNSUPPORTED",
        "READY",
    }
