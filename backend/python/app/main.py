"""Minimal Python reasoning addon entry point.

This service owns no pipeline topology. It receives validated reasoning
requests from the TypeScript backend, performs analysis, and returns a
response matching the shared JSON schema in backend/schema/reasoning.
"""

import os

from fastapi import FastAPI, HTTPException

from app.models.reasoning import ReasoningRequest, ReasoningResponse, Finding

app = FastAPI(title="OneShot Python Reasoning Addon")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/v1/reason")
def reason(request: ReasoningRequest) -> ReasoningResponse:
    """Placeholder reasoning endpoint.

    In a real implementation this would call local models, rule engines, or
    remote AI APIs. The contract (request/response shape) is the hard boundary;
    the implementation behind it can be swapped without touching TypeScript.
    """
    if request.task == "critic":
        # Example: a critic task always returns at least one finding.
        return ReasoningResponse(
            run_id=request.run_id,
            task=request.task,
            success=True,
            confidence=0.85,
            analysis=["Critic review completed."],
            findings=[
                Finding(
                    code="CRITIC-001",
                    severity="info",
                    message="No critical issues detected.",
                )
            ],
            risks=[],
            missing_evidence=[],
            recommendation="Proceed with the proposed plan.",
        )

    return ReasoningResponse(
        run_id=request.run_id,
        task=request.task,
        success=True,
        confidence=0.9,
        analysis=[f"Processed {request.task} task."],
        findings=[],
        risks=[],
        missing_evidence=[],
        recommendation="Proceed.",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
