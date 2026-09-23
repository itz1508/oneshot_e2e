import pytest
from fastapi.testclient import TestClient

from app.main import app, execute_reasoning_core
from app.models.reasoning import ReasoningRequest, ReasoningResponse

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "oneshot-python-reasoner"
    assert "version" in data


def test_reason_accepts_valid_request_and_returns_valid_response():
    payload = {
        "run_id": "run_test_123",
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
    # Detailed payload response verification
    assert body["run_id"] == "run_test_123"
    assert body["task"] == "evaluation"
    assert body["success"] is True
    assert 0.0 <= body["confidence"] <= 1.0
    assert isinstance(body["analysis"], list)
    assert len(body["analysis"]) > 0
    assert isinstance(body["findings"], list)
    assert len(body["findings"]) >= 1
    assert body["findings"][0]["code"] == "EVAL-200"
    assert body["findings"][0]["severity"] == "info"
    assert "recommendation" in body

    # Validate that the response satisfies our Pydantic model
    validated = ReasoningResponse.model_validate(body)
    assert validated.run_id == "run_test_123"


def test_reason_critic_task():
    req = ReasoningRequest(
        run_id="run_critic_456",
        task="critic",
        goal="Audit proposed architecture",
        constraints=["enforce invariant 3"],
        evidence=[],
    )
    resp = execute_reasoning_core(req)
    assert resp.run_id == "run_critic_456"
    assert resp.task == "critic"
    assert resp.success is True
    assert any(f.code == "CRITIC-001" for f in resp.findings)


def test_reason_rejects_invalid_task():
    payload = {
        "run_id": "run_123",
        "task": "unsupported-task-xyz",
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
