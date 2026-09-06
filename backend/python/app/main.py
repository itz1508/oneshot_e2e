"""Python reasoning addon entry point.

This service owns no pipeline topology. It receives validated reasoning
requests from the TypeScript backend, performs analysis, and returns a
response matching the shared JSON schema in backend/schema/reasoning.
"""

import os
from secrets import compare_digest

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import model_validator
from jsonschema import ValidationError as ContractValidationError

from .contracts import (
    validate_request_contract,
    validate_response_contract,
)
from .models import ReasoningRequest, ReasoningResponse
from .reasoner import reason as run_reasoner

app = FastAPI(
    title="OneShot Python Reasoner",
    version="1.0.0",
)


class ContractReasoningRequest(ReasoningRequest):
    @model_validator(mode="before")
    @classmethod
    def validate_wire_contract(cls, value):
        # Validate the original JSON before Pydantic fills defaults or coerces types.
        try:
            validate_request_contract(value)
        except ContractValidationError as error:
            raise ValueError("Request does not match the reasoning contract") from error
        return value


def verify_internal_token(
    authorization: str | None = Header(default=None),
) -> None:
    expected = os.environ.get("ONESHOT_INTERNAL_TOKEN")

    if not expected:
        raise HTTPException(
            status_code=500,
            detail="ONESHOT_INTERNAL_TOKEN is not configured.",
        )

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization required.",
        )

    prefix = "Bearer "

    if not authorization.startswith(prefix):
        raise HTTPException(
            status_code=401,
            detail="Bearer authorization required.",
        )

    supplied = authorization[len(prefix) :]

    if not compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(
            status_code=403,
            detail="Invalid internal token.",
        )


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "oneshot-python",
    }


@app.post(
    "/v1/reason",
    response_model=ReasoningResponse,
    dependencies=[Depends(verify_internal_token)],
)
async def run_reasoning(
    request: ContractReasoningRequest,
) -> ReasoningResponse:
    request_data = request.model_dump(mode="json")
    validate_request_contract(request_data)

    result = run_reasoner(request)

    response_data = result.model_dump(mode="json")
    validate_response_contract(response_data)

    return result


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
