"""Unit tests for the Cosmos skill Python wrapper.

These tests verify configuration parsing and tool group filtering without
requiring a running Cosmos model server.
"""
from __future__ import annotations

import pytest

from oneshot_cosmos_skill.config import CosmosSkillConfig
from oneshot_cosmos_skill.models import CosmosModelService


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "COSMOS_REASONER_URL",
        "COSMOS_GENERATOR_MODEL",
        "COSMOS_VISION_MODEL",
        "COSMOS_VISION_FPS",
    ):
        monkeypatch.delenv(key, raising=False)


def test_config_from_env_reads_reasoner_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COSMOS_REASONER_URL", "http://localhost:8000/v1")
    config = CosmosSkillConfig.from_env()
    assert config.reasoner_url == "http://localhost:8000/v1"
    assert config.generator_model is None


def test_config_default_vision_fps(monkeypatch: pytest.MonkeyPatch) -> None:
    config = CosmosSkillConfig.from_env()
    assert config.vision_fps == 4


def test_service_unconfigured_reasoner_raises() -> None:
    config = CosmosSkillConfig.from_env()
    service = CosmosModelService(config)
    with pytest.raises(RuntimeError, match="COSMOS_REASONER_NOT_CONFIGURED"):
        service.reason("hello")


def test_service_unconfigured_generator_raises() -> None:
    config = CosmosSkillConfig.from_env()
    service = CosmosModelService(config)
    with pytest.raises(RuntimeError, match="COSMOS_GENERATOR_NOT_CONFIGURED"):
        service.generate("text2video", "prompt", None, "out.mp4")


def test_service_unconfigured_vision_raises() -> None:
    config = CosmosSkillConfig.from_env()
    service = CosmosModelService(config)
    with pytest.raises(RuntimeError, match="COSMOS_VISION_NOT_CONFIGURED"):
        service.vision("hello", ["scene.mp4"])
