"""
Multimodal adapters.

Three implementations:

  MultimodalEvidenceAdapter                (Protocol; declared in contracts)
  DeterministicMultimodalEvidenceAdapter   (offline, mandatory)
  CosmosMultimodalEvidenceAdapter          (BOUNDARY ONLY — never installed)

INV-5: MODEL_DERIVED_VISUAL_OBSERVATION is not automatically
       confirmed fact / component / requirement / root cause /
       approved implementation. The adapter classification is
       enforced by MultimodalObservation.__post_init__.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Optional

from ..contracts import (
    MultimodalEvidenceAdapter,
    MultimodalObservation,
    MultimodalReadiness,
)


@dataclass
class DeterministicMultimodalEvidenceAdapter:
    """Test-first offline adapter — returns pre-loaded observations.

    Never contacts a service. Returns the observation registered under
    referenceId, or None if unknown.
    """

    providerLabel: str = "deterministic"
    fixtures: Mapping[str, MultimodalObservation] = field(default_factory=dict)

    def readiness(self) -> MultimodalReadiness:
        return MultimodalReadiness.READY

    async def describe(self, referenceId: str) -> Optional[MultimodalObservation]:
        return self.fixtures.get(referenceId)


@dataclass
class CosmosMultimodalEvidenceAdapter:
    """OPTIONAL adapter boundary — Strands-for-Cosmos-shaped.

    Never installs Cosmos. Never loads a model. `readiness()` reports
    one of the typed readiness states; `describe()` refuses to run
    unless readiness() is READY, and returns None with a limitation
    hint otherwise.

    In this proof, the adapter is CONSTRUCTED with a scripted
    readiness — this lets tests prove the fallback discipline
    (NOT_INSTALLED / HARDWARE_UNSUPPORTED both continue evaluation).
    """

    providerLabel: str = "strands-for-cosmos-boundary"
    scriptedReadiness: MultimodalReadiness = MultimodalReadiness.NOT_INSTALLED

    def readiness(self) -> MultimodalReadiness:
        return self.scriptedReadiness

    async def describe(self, referenceId: str) -> Optional[MultimodalObservation]:
        if self.scriptedReadiness is not MultimodalReadiness.READY:
            # Fallback discipline: refuse to fabricate an observation.
            # Return None; the middleware records a limitation and
            # continues with deterministic evaluation.
            return None
        # This branch is present for shape only — in this proof we
        # never install Cosmos, so no real inference happens even if
        # scriptedReadiness is READY. The proof-mode branch returns a
        # placeholder MODEL_DERIVED_VISUAL_OBSERVATION labelled
        # explicitly as "proof-mode".
        return MultimodalObservation(
            observationId=f"cosmos-proofmode:{referenceId}",
            modality="image",
            summary="proof-mode placeholder — Cosmos not installed in this build",
            providerLabel=self.providerLabel,
        )


__all__ = [
    "DeterministicMultimodalEvidenceAdapter",
    "CosmosMultimodalEvidenceAdapter",
    "MultimodalEvidenceAdapter",
]
