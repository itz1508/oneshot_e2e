"""Shared building blocks for OneShot provider worker processes.

Workers only surface safe, static failure text to the Node bridge: no
response or error bodies enter diagnostics.
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any, Callable

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DraftDependency(Strict):
    description: str
    required_by: list[int]


class DraftStep(Strict):
    description: str
    responsibility: str
    requirement_indexes: list[int] = Field(min_length=1)


class DraftCriterion(Strict):
    statement: str
    measurement: str
    expected_result: str
    requirement_indexes: list[int] = Field(min_length=1)


class ResearchDraft(Strict):
    deliverable: str | None = None
    summary: str
    requirements: list[str] = Field(min_length=1)
    dependencies: list[DraftDependency]
    plan_steps: list[DraftStep] = Field(min_length=1)
    success_meaning: str
    success_criteria: list[DraftCriterion] = Field(min_length=1)


_emit_enabled = False


def set_emit_enabled(enabled: bool) -> None:
    global _emit_enabled
    _emit_enabled = enabled


def emit(req_id: int | None, node: str, state: str, message: str | None = None):
    """Emit a node lifecycle event on stdout; ignored unless enabled."""
    if not _emit_enabled:
        return
    payload = {"id": req_id, "event": {"node": node, "state": state}}
    if message:
        payload["event"]["message"] = message
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def extract_json_content(content: str) -> str:
    """Strip a Markdown fenced code block, if the model wrapped its reply."""
    value = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", value, re.DOTALL)
    return fenced.group(1) if fenced else value


def default_error_message(error: Exception) -> str:
    return f"{type(error).__name__}: {error}"


def serve(
    dispatch: Callable[[dict[str, Any]], Any],
    format_error: Callable[[Exception], str] = default_error_message,
) -> None:
    """Stdin/stdout line-delimited JSON request loop shared by all workers."""
    for line in sys.stdin:
        message: dict[str, Any] = {}
        try:
            message = json.loads(line)
            result = dispatch(message)
            output = {"id": message.get("id"), "ok": True, "result": result}
        except Exception as error:
            output = {
                "id": message.get("id"),
                "ok": False,
                "error": format_error(error),
            }
        print(json.dumps(output, separators=(",", ":")), flush=True)
