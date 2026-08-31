from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

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
    summary: str
    requirements: list[str] = Field(min_length=1)
    dependencies: list[DraftDependency]
    plan_steps: list[DraftStep] = Field(min_length=1)
    success_meaning: str
    success_criteria: list[DraftCriterion] = Field(min_length=1)


MODEL = os.getenv("FEATHERLESS_MODEL", "google/gemma-4-31B-it")
BASE = os.getenv("FEATHERLESS_API_BASE", "https://api.featherless.ai/v1").rstrip("/")
TIMEOUT = max(1, int(os.getenv("FEATHERLESS_TIMEOUT_SECONDS", "300")))
MAX_TOKENS = max(256, int(os.getenv("FEATHERLESS_MAX_TOKENS", "4096")))
APP_URL = os.getenv("FEATHERLESS_APP_URL", "").strip()
TEST_DRAFT = os.getenv("ONESHOT_FEATHERLESS_TEST_DRAFT_FILE", "").strip()
EMIT_EVENTS = (
    os.getenv("ONESHOT_FEATHERLESS_EMIT_EVENTS", "false").lower() == "true"
)
_client_instance = None


def emit(req_id: int | None, node: str, state: str, message: str | None = None):
    if not EMIT_EVENTS:
        return
    payload = {"id": req_id, "event": {"node": node, "state": state}}
    if message:
        payload["event"]["message"] = message
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def _client():
    global _client_instance
    if _client_instance is not None:
        return _client_instance

    api_key = os.getenv("FEATHERLESS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("FEATHERLESS_API_KEY is not configured")

    from openai import OpenAI

    headers = {"X-Title": "OneShot"}
    if APP_URL:
        headers["HTTP-Referer"] = APP_URL
    _client_instance = OpenAI(
        base_url=BASE,
        api_key=api_key,
        timeout=TIMEOUT,
        max_retries=2,
        default_headers=headers,
    )
    return _client_instance


def _json_content(content: str) -> str:
    value = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", value, re.DOTALL)
    return fenced.group(1) if fenced else value


def _infer(prompt: dict[str, Any], evidence: list[dict[str, Any]]) -> ResearchDraft:
    schema = ResearchDraft.model_json_schema()
    system = (
        "You are the Researcher model inside OneShot. Return one JSON object only, "
        "with no Markdown or commentary, that validates against the supplied JSON "
        "Schema. Use supplied evidence as support. required_by and "
        "requirement_indexes contain zero-based requirement indexes. Derive concise "
        "requirements, dependencies, implementation steps, success meaning, and "
        "measurable success criteria. Do not invent deployment, provider, database, "
        "security, or workflow requirements that the prompt does not request."
    )
    request = json.dumps(
        {"prompt": prompt, "evidence": evidence, "output_schema": schema},
        ensure_ascii=False,
    )
    completion = _client().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": request},
        ],
        temperature=0.2,
        max_tokens=MAX_TOKENS,
    )
    if not completion.choices:
        raise RuntimeError("Featherless returned no completion choices")
    content = completion.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Featherless returned no message content")
    return ResearchDraft.model_validate_json(_json_content(content))


async def research(payload: dict[str, Any], req_id: int | None) -> dict[str, Any]:
    prompt = payload["prompt"]
    evidence = payload.get("evidence", [])
    emit(
        req_id,
        "researcher-provider",
        "RUNNING",
        f"provider=featherless model={MODEL}",
    )
    emit(req_id, "featherless-api", "RUNNING", BASE)
    emit(req_id, "gemma", "RUNNING", MODEL)

    if TEST_DRAFT:
        draft = ResearchDraft.model_validate_json(
            Path(TEST_DRAFT).read_text(encoding="utf-8")
        )
    else:
        draft = await asyncio.wait_for(
            asyncio.to_thread(_infer, prompt, evidence), timeout=TIMEOUT
        )

    emit(req_id, "gemma", "COMPLETE", "structured response returned")
    emit(req_id, "featherless-api", "COMPLETE")
    emit(req_id, "research-draft", "COMPLETE", "structured draft validated")
    emit(req_id, "researcher-provider", "COMPLETE")
    return draft.model_dump()


async def dispatch(message: dict[str, Any]):
    if message.get("op") == "research":
        return await research(message["payload"], message.get("id"))
    if message.get("op") == "health":
        return {
            "model": MODEL,
            "api_base": BASE,
            "timeout_seconds": TIMEOUT,
            "max_tokens": MAX_TOKENS,
            "test_mode": bool(TEST_DRAFT),
        }
    raise ValueError(f"unknown op {message.get('op')}")


async def main():
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        try:
            message = json.loads(line)
            result = await dispatch(message)
            output = {"id": message.get("id"), "ok": True, "result": result}
        except Exception as error:
            output = {
                "id": message.get("id"),
                "ok": False,
                "error": f"{type(error).__name__}: {error}",
            }
        print(json.dumps(output, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
