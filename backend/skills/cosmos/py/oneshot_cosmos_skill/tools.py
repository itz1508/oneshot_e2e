"""Expose selected strands-cosmos tools to the Node bridge.

Only tools in groups activated by the user are registered at runtime.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from oneshot_cosmos_skill.models import CosmosModelService


def build_tools(
    model_service: "CosmosModelService", enabled_groups: list[str]
) -> dict[str, Callable[..., Any]]:
    tools: dict[str, Callable[..., Any]] = {}
    if "vision" in enabled_groups:
        tools["cosmos_reason"] = lambda args: model_service.reason(
            args["prompt"], args.get("media")
        )
        tools["cosmos_vision"] = lambda args: model_service.vision(
            args["prompt"], args["media"]
        )
    if "generate" in enabled_groups:
        tools["cosmos_generate_video"] = lambda args: model_service.generate(
            args["mode"], args["prompt"], args.get("image_path"), args["out_path"]
        )
    # action, curate, deploy, evaluate, system groups map to additional
    # strands-cosmos tools in future iterations.
    return tools
