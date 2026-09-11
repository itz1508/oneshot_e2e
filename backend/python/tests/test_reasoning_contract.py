import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import ReasoningRequest, ReasoningResponse

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "oneshot-python"}


@pytest.mark.parametrize("changes", [
    {"evidence": [{"source": "test", "content": "test", "confidence": "0.9"}]},
    {"evidence": [{"source": "test", "content": "test"}]},
    {"unexpected": True},
])
def test_reason_rejects_wire_contract_mismatch(changes):
    payload = {"run_id": "test", "task": "critic", "goal": "test",
               "constraints": [], "evidence": []}
    payload.update(changes)
    assert client.post("/v1/reason", json=payload).status_code == 422


@pytest.mark.parametrize("field", ["constraints", "evidence"])
def test_reason_rejects_missing_required_collection(field):
    payload = {"run_id": "test", "task": "critic", "goal": "test",
               "constraints": [], "evidence": []}
    del payload[field]
    assert client.post("/v1/reason", json=payload).status_code == 422


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
        "plan": {
            "id": "plan_123",
            "objective": "Implement feature",
            "status": "refactored",
            "tasks": [
                {
                    "id": "task_1",
                    "title": "Implement",
                    "action": "Implement requested behavior",
                    "required": True,
                }
            ],
        },
    }

    response = client.post(
        "/v1/reason",
        json=payload,
    )
    assert response.status_code == 200

    body = response.json()
    assert body["run_id"] == "run_123"
    assert body["task"] == "evaluation"
    assert isinstance(body["success"], bool)
    assert 0.0 <= body["confidence"] <= 1.0
    assert isinstance(body["findings"], list)

    # Validate that the response also satisfies our Pydantic model.
    ReasoningResponse.model_validate(body)


def test_reason_accepts_request_without_authorization_header():
    """The reasoner is an internal deployment component with no credential."""
    payload = {
        "run_id": "run_123",
        "task": "evaluation",
        "goal": "Verify",
        "constraints": [],
        "evidence": [],
    }

    response = client.post("/v1/reason", json=payload)
    assert response.status_code != 401
    assert response.status_code != 403


def test_reason_rejects_invalid_task():
    payload = {
        "run_id": "run_123",
        "task": "unknown-task",
        "goal": "Verify",
        "constraints": [],
        "evidence": [],
    }

    response = client.post(
        "/v1/reason",
        json=payload,
    )
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
