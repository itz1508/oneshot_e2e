"""Cosmos model wrappers exposed to the Node bridge via JSON-RPC."""
from __future__ import annotations

from typing import Any

from strands import Agent
from strands_cosmos import (
    Cosmos3GeneratorModel,
    Cosmos3ReasonerModel,
    CosmosVisionModel,
)

from oneshot_cosmos_skill.config import CosmosSkillConfig


def _format_media(media: list[str]) -> str:
    parts: list[str] = []
    for path in media:
        if path.endswith(".mp4"):
            parts.append(f"<video>{path}</video>")
        else:
            parts.append(f"<image>{path}</image>")
    return "\n".join(parts)


class CosmosModelService:
    def __init__(self, config: CosmosSkillConfig) -> None:
        self.config = config
        self.reasoner = (
            Cosmos3ReasonerModel(base_url=config.reasoner_url, reasoning=True)
            if config.reasoner_url
            else None
        )
        self.generator = (
            Cosmos3GeneratorModel(model_id=config.generator_model)
            if config.generator_model
            else None
        )
        self.vision = (
            CosmosVisionModel(
                model_id=config.vision_model,
                reasoning=True,
                fps=config.vision_fps,
            )
            if config.vision_model
            else None
        )

    def reason(self, prompt: str, media: list[str] | None = None) -> str:
        if not self.reasoner:
            raise RuntimeError("COSMOS_REASONER_NOT_CONFIGURED")
        agent = Agent(model=self.reasoner)
        if media:
            prompt = f"{prompt}\n{_format_media(media)}"
        return str(agent(prompt))

    def generate(
        self,
        mode: str,
        prompt: str,
        image_path: str | None,
        out_path: str,
    ) -> str:
        if not self.generator:
            raise RuntimeError("COSMOS_GENERATOR_NOT_CONFIGURED")
        kwargs: dict[str, Any] = {
            "mode": mode,
            "prompt": prompt,
            "out_path": out_path,
        }
        if image_path:
            kwargs["image"] = image_path
        if mode == "text2video-with-sound":
            kwargs["enable_sound"] = True
        self.generator.generate(**kwargs)
        return out_path

    def vision(self, prompt: str, media: list[str]) -> str:
        if not self.vision:
            raise RuntimeError("COSMOS_VISION_NOT_CONFIGURED")
        agent = Agent(model=self.vision)
        return str(agent(f"{prompt}\n{_format_media(media)}"))
