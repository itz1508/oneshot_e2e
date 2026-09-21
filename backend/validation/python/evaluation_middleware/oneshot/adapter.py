"""
Thin OneShot adapter — construct EvaluationRequests from
capability-catalog-shaped inputs (as used by the sibling
scan-scoped-preview-v2 v2.1 Config Option Installation surface).

This adapter does NOT import or modify scan-scoped-preview-v2. It
consumes a *shape* — plain dicts / dataclasses — and produces a typed
EvaluationRequest. This keeps this proof independent from the earlier
artifact per the "no modification" constraint.

Consumer contract (from the OneShot side): pass a list of capability
snapshots and a build outcome; get back an EvaluationRequest ready
to hand to `EvaluationMiddleware.evaluate`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

from ..contracts import (
    EvaluationItem,
    EvaluationRequest,
    EvaluatorConfiguration,
    EvidenceClass,
    EvidenceReference,
    ExpectedWorkflow,
    ExplicitAssertion,
    WorkflowEdge,
    WorkflowPhase,
)


@dataclass(frozen=True)
class OneShotCapabilitySnapshot:
    """OneShot side's shape — capability id, whether it is observed
    (i.e. state INSTALLED-or-later) and whether it is enabled."""

    capabilityId: str
    observed: bool
    enabled: bool


def build_request_from_capability_snapshot(
    *,
    evaluationId: str,
    targetId: str,
    buildId: str | None,
    requestedGoal: str,
    expectedCapabilities: Sequence[str],
    optionalCapabilities: Sequence[str] = (),
    forbiddenCapabilities: Sequence[str] = (),
    snapshots: Iterable[OneShotCapabilitySnapshot],
    buildOutput: str = "",
    evidence: Sequence[EvidenceReference] = (),
    explicitAssertions: Sequence[ExplicitAssertion] = (),
    expectedWorkflow: ExpectedWorkflow | None = None,
    actualWorkflow: Sequence = (),
    evaluatorConfiguration: EvaluatorConfiguration = EvaluatorConfiguration(),
    timeoutSeconds: float | None = None,
) -> EvaluationRequest:
    """Assemble an EvaluationRequest.

    - Every expected capability becomes both an expectedComponent and a
      requirement `"install::<capabilityId>"` that depends on the
      capability id.
    - Optional capabilities are `required=False`.
    - Forbidden capabilities become negative assertions with predicate
      `component_absent`.
    """
    snap_by_id: Mapping[str, OneShotCapabilitySnapshot] = {
        s.capabilityId: s for s in snapshots
    }
    observed_components: tuple[str, ...] = tuple(
        sorted(s.capabilityId for s in snap_by_id.values() if s.observed)
    )
    expected_components: list[EvaluationItem] = [
        EvaluationItem(
            itemId=cid,
            kind="component",
            summary=f"capability {cid} should be observed",
            required=True,
        )
        for cid in expectedCapabilities
    ]
    for cid in optionalCapabilities:
        expected_components.append(
            EvaluationItem(
                itemId=cid,
                kind="component",
                summary=f"optional capability {cid}",
                required=False,
            )
        )

    requirements: list[EvaluationItem] = []
    for cid in expectedCapabilities:
        requirements.append(
            EvaluationItem(
                itemId=f"install::{cid}",
                kind="requirement",
                summary=f"capability {cid} must be installed",
                required=True,
                dependsOn=(cid,),
            )
        )
    for cid in optionalCapabilities:
        requirements.append(
            EvaluationItem(
                itemId=f"install::{cid}",
                kind="requirement",
                summary=f"optional capability {cid} may be installed",
                required=False,
                dependsOn=(cid,),
            )
        )

    assertions: list[ExplicitAssertion] = list(explicitAssertions)
    for cid in forbiddenCapabilities:
        assertions.append(
            ExplicitAssertion(
                assertionId=f"forbidden::{cid}",
                description=f"capability {cid} MUST NOT be observed",
                predicateKey="component_absent",
                predicateArgs={"componentId": cid},
                required=True,
            )
        )

    return EvaluationRequest(
        evaluationId=evaluationId,
        targetId=targetId,
        buildId=buildId,
        requestedGoal=requestedGoal,
        requirements=tuple(requirements),
        explicitAssertions=tuple(assertions),
        expectedComponents=tuple(expected_components),
        observedComponents=observed_components,
        buildOutput=buildOutput,
        evidenceReferences=tuple(evidence),
        expectedWorkflow=expectedWorkflow,
        actualWorkflow=tuple(actualWorkflow),
        evaluatorConfiguration=evaluatorConfiguration,
        timeoutSeconds=timeoutSeconds,
    )


__all__ = [
    "OneShotCapabilitySnapshot",
    "build_request_from_capability_snapshot",
]
