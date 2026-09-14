"""Cosmos skill configuration loaded from environment."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class CosmosSkillConfig:
    reasoner_url: str | None
    generator_model: str | None
    vision_model: str | None
    vision_fps: int

    @classmethod
    def from_env(cls) -> "CosmosSkillConfig":
        return cls(
            reasoner_url=os.getenv("COSMOS_REASONER_URL") or None,
            generator_model=os.getenv("COSMOS_GENERATOR_MODEL") or None,
            vision_model=os.getenv("COSMOS_VISION_MODEL") or None,
            vision_fps=int(os.getenv("COSMOS_VISION_FPS", "4")),
        )
