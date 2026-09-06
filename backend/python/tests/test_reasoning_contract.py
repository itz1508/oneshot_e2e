import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.reasoning import ReasoningRequest, ReasoningResponse

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_reason_accepts_valid_request_and_returns_valid_response():
    payload = {
        "run_id": "run_123",
        "task": "evaluation",
        "goal": "Verify the build plan",
        "constraints": ["use only public APIs"],
        "evidence": [
            {
                "source": "canonical-contract",
                "content": "Plan uses public APIs only",
                "confidence": 0.95,
            }
        ],
        "plan": {"steps": []},
    }

    response = client.post("/v1/reason", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["run_id"] == "run_123"
    assert body["task"] == "evaluation"
    assert isinstance(body["success"], bool)
    assert 0.0 <= body["confidence"] <= 1.0
    assert isinstance(body["findings"], list)

    # Validate that the response also satisfies our Pydantic model.
    ReasoningResponse.model_validate(body)


def test_reason_rejects_invalid_task():
    payload = {
        "run_id": "run_123",
        "task": "unknown-task",
        "goal": "Verify",
        "constraints": [],
        "evidence": [],
    }

    response = client.post("/v1/reason", json=payload)
    assert response.status_code == 422


def test_pydantic_request_rejects_missing_run_id():
    with pytest.raises(ValueError):
        ReasoningRequest(
            run_id="",
            task="evaluation",
            goal="Verify",
            constraints=[],
            evidence=[],
        )
