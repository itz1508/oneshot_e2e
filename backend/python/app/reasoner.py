from .models import (
    Finding,
    Plan,
    ReasoningRequest,
    ReasoningResponse,
    ReasoningTask,
)


def reason(request: ReasoningRequest) -> ReasoningResponse:
    if request.task == ReasoningTask.EVALUATION:
        return evaluate(request)

    if request.task == ReasoningTask.PLANNER:
        return evaluate_plan(request)

    if request.task == ReasoningTask.GAP_ANALYSIS:
        return analyze_gaps(request)

    if request.task == ReasoningTask.CRITIC:
        return critique(request)

    return analyze_research(request)


def evaluate(request: ReasoningRequest) -> ReasoningResponse:
    findings: list[Finding] = []
    risks: list[str] = []
    missing: list[str] = []
    analysis: list[str] = []

    if request.plan is None:
        findings.append(
            Finding(
                code="EVALUATION_PLAN_MISSING",
                severity="critical",
                message="Evaluation requires a final plan.",
            )
        )
    else:
        analysis.append(f"Evaluating plan {request.plan.id}.")
        analysis.append(f"Plan contains {len(request.plan.tasks)} tasks.")

        if len(request.plan.tasks) == 0:
            findings.append(
                Finding(
                    code="EVALUATION_EMPTY_PLAN",
                    severity="critical",
                    message="Plan contains no executable tasks.",
                )
            )

    if not request.evidence:
        missing.append("No supporting evidence was supplied.")

    if not request.constraints:
        risks.append("No explicit constraints were supplied.")

    confidence = calculate_confidence(
        evidence_count=len(request.evidence),
        finding_count=len(findings),
        missing_count=len(missing),
        risk_count=len(risks),
    )

    success = len(findings) == 0 and len(missing) == 0

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=success,
        confidence=confidence,
        analysis=analysis,
        findings=findings,
        risks=risks,
        missing_evidence=missing,
        recommendation=(
            "Proceed to Triple Validation."
            if success
            else "Do not proceed to validation until the reported issues are resolved."
        ),
    )


def evaluate_plan(request: ReasoningRequest) -> ReasoningResponse:
    findings: list[Finding] = []

    if request.plan is None:
        findings.append(
            Finding(
                code="PLANNER_PLAN_MISSING",
                severity="critical",
                message="Planner requires a plan.",
            )
        )

    success = not findings

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=success,
        confidence=0.9 if success else 0.0,
        analysis=["Planner reasoning completed."],
        findings=findings,
        risks=[],
        missing_evidence=[],
        recommendation=(
            "Continue to Refactor." if success else "Return to plan generation."
        ),
    )


def analyze_gaps(request: ReasoningRequest) -> ReasoningResponse:
    findings: list[Finding] = []

    if request.plan is None:
        findings.append(
            Finding(
                code="GAP_PLAN_MISSING",
                severity="critical",
                message="Gap Analysis requires a plan.",
            )
        )

    success = not findings

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=success,
        confidence=0.85 if success else 0.0,
        analysis=["Gap analysis completed."],
        findings=findings,
        risks=[],
        missing_evidence=[],
        recommendation=(
            "Continue to Evaluation." if success else "Repair detected gaps."
        ),
    )


def critique(request: ReasoningRequest) -> ReasoningResponse:
    risks: list[str] = []

    if not request.evidence:
        risks.append("The result has weak evidence support.")

    confidence = 0.9 if not risks else 0.6

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=not risks,
        confidence=confidence,
        analysis=["Critic review completed."],
        findings=[],
        risks=risks,
        missing_evidence=[],
        recommendation=(
            "Result is sufficiently supported."
            if not risks
            else "Gather more evidence."
        ),
    )


def analyze_research(request: ReasoningRequest) -> ReasoningResponse:
    missing: list[str] = []

    if not request.evidence:
        missing.append("Research evidence is missing.")

    success = not missing

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=success,
        confidence=0.9 if success else 0.4,
        analysis=[f"Reviewed {len(request.evidence)} evidence items."],
        findings=[],
        risks=[],
        missing_evidence=missing,
        recommendation=(
            "Proceed to Plan Review."
            if success
            else "Continue Researcher evidence collection."
        ),
    )


def calculate_confidence(
    *,
    evidence_count: int,
    finding_count: int,
    missing_count: int,
    risk_count: int,
) -> float:
    value = 0.65

    value += min(evidence_count * 0.05, 0.25)
    value -= min(finding_count * 0.15, 0.45)
    value -= min(missing_count * 0.20, 0.40)
    value -= min(risk_count * 0.05, 0.20)

    return round(max(0.0, min(1.0, value)), 2)
