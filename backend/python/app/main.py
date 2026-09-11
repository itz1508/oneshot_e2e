"""Python reasoning addon entry point.

This service owns no pipeline topology. It receives validated reasoning
requests from the TypeScript backend, performs analysis, and returns a
response matching the shared JSON schema in backend/schema/reasoning.

The reasoner is an internal deployment component: it is reachable only
through the deployment/network boundary and requires no user-configured
authentication.
"""

import os

from fastapi import FastAPI
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


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "oneshot-python",
    }


@app.post("/v1/reason", response_model=ReasoningResponse)
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
