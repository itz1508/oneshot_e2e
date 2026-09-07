from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

# This worker lives one directory below the shared worker helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _worker_common import (  # noqa: E402
    ResearchDraft,
    emit,
    extract_json_content,
    serve,
    set_emit_enabled,
)

MODEL = os.getenv("FEATHERLESS_MODEL", "google/gemma-4-31B-it")
BASE = os.getenv("FEATHERLESS_API_BASE", "https://api.featherless.ai/v1").rstrip("/")
TIMEOUT = max(1, int(os.getenv("FEATHERLESS_TIMEOUT_SECONDS", "300")))
MAX_TOKENS = max(256, int(os.getenv("FEATHERLESS_MAX_TOKENS", "4096")))
APP_URL = os.getenv("FEATHERLESS_APP_URL", "").strip()
TEST_DRAFT = os.getenv("ONESHOT_FEATHERLESS_TEST_DRAFT_FILE", "").strip()
_client_instance = None


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


def _health() -> dict[str, Any]:
    if TEST_DRAFT:
        return {
            "ready": True,
            "provider": "featherless",
            "model": MODEL,
            "api_base": BASE,
            "detail": "deterministic adapter draft configured",
        }
    if not os.getenv("FEATHERLESS_API_KEY", "").strip():
        return {
            "ready": False,
            "provider": "featherless",
            "model": MODEL,
            "api_base": BASE,
            "detail": "FEATHERLESS_API_KEY is not configured",
        }
    try:
        _client()
    except Exception as error:
        return {
            "ready": False,
            "provider": "featherless",
            "model": MODEL,
            "api_base": BASE,
            "detail": f"{type(error).__name__}: {error}",
        }
    return {
        "ready": True,
        "provider": "featherless",
        "model": MODEL,
        "api_base": BASE,
        "detail": "client and credential binding ready",
    }


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
    return ResearchDraft.model_validate_json(extract_json_content(content))


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


def dispatch(message: dict[str, Any]):
    if message.get("op") == "research":
        return asyncio.run(research(message["payload"], message.get("id")))
    if message.get("op") == "health":
        return _health()
    raise ValueError(f"unknown op {message.get('op')}")


if __name__ == "__main__":
    set_emit_enabled(
        os.getenv("ONESHOT_FEATHERLESS_EMIT_EVENTS", "false").lower() == "true"
    )
    serve(dispatch)
