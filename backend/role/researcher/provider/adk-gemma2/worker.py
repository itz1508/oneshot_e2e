from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

os.environ["LITELLM_LOG"] = "ERROR"
os.environ["LITELLM_SUPPRESS_DEBUG_INFO"] = "true"

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


DISTRIBUTION_MODEL = os.getenv("GEMMA2_DISTRIBUTION_MODEL", "").strip()
RESEARCH_MODEL = os.getenv("GEMMA2_RESEARCH_MODEL", "").strip()
SYNTHESIS_MODEL = os.getenv("GEMMA2_SYNTHESIS_MODEL", "").strip()
BASE = os.getenv("OLLAMA_API_BASE", "http://localhost:11434").rstrip("/")
TTL = max(1, int(os.getenv("CACHE_TTL", "3600")))
TIMEOUT = max(1, int(os.getenv("GEMMA2_TIMEOUT_SECONDS", "300")))
AUTO_PULL = os.getenv("GEMMA2_AUTO_PULL", "false").lower() == "true"
TEST_DRAFT = os.getenv("ONESHOT_ADK_TEST_DRAFT_FILE", "").strip()
EMIT_EVENTS = os.getenv("ONESHOT_ADK_EMIT_EVENTS", "false").lower() == "true"
_cache: dict[str, tuple[float, str]] = {}
_redis = None
_runner = None


def emit(req_id: int | None, node: str, state: str, message: str | None = None):
    if not EMIT_EVENTS:
        return
    payload = {"id": req_id, "event": {"node": node, "state": state}}
    if message:
        payload["event"]["message"] = message
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def _preview(text: str, limit: int = 700) -> str:
    return " ".join(text.split())[:limit]


def _pipeline_models() -> list[str]:
    models = [DISTRIBUTION_MODEL, RESEARCH_MODEL, SYNTHESIS_MODEL]
    if any(not model for model in models):
        raise RuntimeError(
            "Researcher model pipeline is not fully bound: distribution, research, and synthesis models are required"
        )
    if not TEST_DRAFT and len(set(models)) != 3:
        raise RuntimeError(
            "Researcher model pipeline requires three distinct model bindings"
        )
    return models


def _key(prompt: dict[str, Any], evidence: list[dict[str, Any]]) -> str:
    semantic = {
        "intent": prompt.get("intent", ""),
        "requested_outcome": prompt.get("requested_outcome", ""),
        "context": [
            x.get("statement", "")
            for x in prompt.get("context", [])
            if isinstance(x, dict)
        ],
        "research_direction": prompt.get("research_direction", []),
        "evidence": [
            {"source": x.get("source", ""), "statement": x.get("statement", "")}
            for x in evidence
        ],
    }
    raw = json.dumps(
        {"models": _pipeline_models(), "prompt": semantic},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()
    return "oneshot:adk-pipeline-draft:" + hashlib.sha256(raw).hexdigest()


async def _cache_get(key: str) -> str | None:
    global _redis
    if _redis is None and os.getenv("CACHE_URL"):
        try:
            import redis.asyncio as redis

            _redis = redis.from_url(
                os.environ["CACHE_URL"],
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
            await _redis.ping()
        except Exception:
            _redis = False
    if _redis:
        try:
            return await _redis.get(key)
        except Exception:
            pass
    item = _cache.get(key)
    if item and item[0] > time.time():
        return item[1]
    if item:
        _cache.pop(key, None)
    return None


async def _cache_set(key: str, value: str):
    if _redis:
        try:
            await _redis.setex(key, TTL, value)
            return
        except Exception:
            pass
    _cache[key] = (time.time() + TTL, value)


def _ollama_tags() -> list[str]:
    with urllib.request.urlopen(BASE + "/api/tags", timeout=5) as response:
        data = json.loads(response.read().decode())
        return [model.get("name", "") for model in data.get("models", [])]


def _pull_model(model: str):
    req = urllib.request.Request(
        BASE + "/api/pull",
        data=json.dumps({"name": model, "stream": False}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=3600) as response:
        if response.status != 200:
            raise RuntimeError(f"Ollama pull failed for {model}: HTTP {response.status}")


def _ensure_ollama():
    models = _pipeline_models()
    try:
        installed = _ollama_tags()
    except Exception as error:
        raise RuntimeError(f"Ollama is not reachable at {BASE}: {error}") from error

    missing = [model for model in models if model not in installed]
    if not missing:
        return
    if not AUTO_PULL:
        raise RuntimeError(
            "Researcher pipeline models are not installed in Ollama: "
            + ", ".join(missing)
        )
    for model in missing:
        _pull_model(model)


def _health() -> dict[str, Any]:
    models = _pipeline_models()
    if TEST_DRAFT:
        return {
            "ready": True,
            "provider": "google-adk",
            "models": models,
            "ollama_api_base": BASE,
            "detail": "deterministic adapter draft configured",
        }
    try:
        installed = _ollama_tags()
    except Exception as error:
        return {
            "ready": False,
            "provider": "google-adk",
            "models": models,
            "ollama_api_base": BASE,
            "detail": f"Ollama is not reachable: {error}",
        }
    missing = [model for model in models if model not in installed]
    return {
        "ready": not missing,
        "provider": "google-adk",
        "models": models,
        "ollama_api_base": BASE,
        "detail": (
            "three model bindings ready"
            if not missing
            else "missing Ollama models: " + ", ".join(missing)
        ),
    }


async def _build_runner():
    global _runner
    if _runner is not None:
        return _runner

    await asyncio.to_thread(_ensure_ollama)
    os.environ["OLLAMA_API_BASE"] = BASE

    from google.adk.agents import LlmAgent, SequentialAgent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.runners import InMemoryRunner

    distribution_agent = LlmAgent(
        name="ResearcherDistribution",
        model=LiteLlm(
            model=f"ollama_chat/{DISTRIBUTION_MODEL}",
            api_base=BASE,
        ),
        instruction=(
            "You are the distribution stage of the OneShot Researcher pipeline. "
            "Read the user request and supplied repository evidence. Decide what the research stage must focus on, "
            "which evidence is relevant, what information is missing, and how success can be measured. "
            "Do not produce the final ResearchDraft and do not invent repository facts."
        ),
        output_key="research_distribution",
    )

    research_agent = LlmAgent(
        name="ResearcherResearch",
        model=LiteLlm(
            model=f"ollama_chat/{RESEARCH_MODEL}",
            api_base=BASE,
        ),
        instruction=(
            "You are the research stage of the OneShot Researcher pipeline. "
            "Use the user request, supplied evidence, and the preceding distribution analysis to prepare an evidence-backed candidate for the final ResearchDraft. "
            "Requirements and success criteria must be grounded in supplied evidence. "
            "Dependency required_by indexes refer to requirement indexes, not plan-step indexes. "
            "If the request asks for executable sandbox implementation steps, preserve that requirement and propose directly executable commands without Markdown fences. "
            "Do not invent deployment, provider, database, security, or workflow requirements that are not requested."
        ),
        output_key="research_candidate",
    )

    synthesis_agent = LlmAgent(
        name="ResearcherSynthesis",
        model=LiteLlm(
            model=f"ollama_chat/{SYNTHESIS_MODEL}",
            api_base=BASE,
        ),
        instruction=(
            "You are the synthesis stage of the OneShot Researcher pipeline. "
            "Review the original request, evidence, distribution analysis, and research candidate. "
            "Return one final ResearchDraft that preserves evidence-backed requirements, dependencies, implementation steps, success meaning, and measurable success criteria. "
            "When the user explicitly asks for executable sandbox implementation, each plan_steps.description must be a directly executable command beginning with node, sh, bash, python, or echo; never wrap commands in Markdown or explanatory prose. "
            "Preserve literal verification strings requested by the user so execution evidence can prove the product behavior. "
            "Correct inconsistencies without inventing unsupported facts."
        ),
        output_schema=ResearchDraft,
        output_key="research_final",
    )

    pipeline = SequentialAgent(
        name="OneShotResearcherPipeline",
        sub_agents=[distribution_agent, research_agent, synthesis_agent],
        description="Three-model distribution -> research -> synthesis pipeline.",
    )
    _runner = InMemoryRunner(app_name="oneshot_researcher_pipeline", agent=pipeline)
    return _runner


async def _adk(
    prompt: dict[str, Any], evidence: list[dict[str, Any]], req_id: int | None
) -> ResearchDraft:
    emit(req_id, "researcher-pipeline", "RUNNING", "distribution -> research -> synthesis")
    emit(req_id, "distribution-model", "RUNNING", DISTRIBUTION_MODEL)

    runner = await _build_runner()
    session = await runner.session_service.create_session(
        app_name="oneshot_researcher_pipeline", user_id="oneshot"
    )
    from google.genai import types

    message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=json.dumps(
                    {"prompt": prompt, "evidence": evidence}, ensure_ascii=False
                )
            )
        ],
    )

    stage_outputs: dict[str, str] = {}
    stage_nodes = {
        "ResearcherDistribution": ("distribution-model", DISTRIBUTION_MODEL),
        "ResearcherResearch": ("research-model", RESEARCH_MODEL),
        "ResearcherSynthesis": ("synthesis-model", SYNTHESIS_MODEL),
    }
    started = {"ResearcherDistribution"}

    async for event in runner.run_async(
        user_id="oneshot", session_id=session.id, new_message=message
    ):
        final = getattr(event, "is_final_response", None)
        if callable(final) and not final():
            continue
        if not event.content or not event.content.parts:
            continue
        text = "\n".join(
            part.text
            for part in event.content.parts
            if getattr(part, "text", None)
        ).strip()
        if not text:
            continue

        author = getattr(event, "author", None)
        if author not in stage_nodes:
            continue
        stage_outputs[author] = text
        node_name, model_name = stage_nodes[author]
        emit(
            req_id,
            node_name,
            "COMPLETE",
            f"model={model_name} response={_preview(text)}",
        )

        if author == "ResearcherDistribution" and "ResearcherResearch" not in started:
            started.add("ResearcherResearch")
            emit(req_id, "research-model", "RUNNING", RESEARCH_MODEL)
        if author == "ResearcherResearch" and "ResearcherSynthesis" not in started:
            started.add("ResearcherSynthesis")
            emit(req_id, "synthesis-model", "RUNNING", SYNTHESIS_MODEL)

    missing = [name for name in stage_nodes if name not in stage_outputs]
    if missing:
        raise RuntimeError(
            "Google ADK Researcher pipeline did not return final responses for: "
            + ", ".join(missing)
        )

    final_text = stage_outputs["ResearcherSynthesis"]
    emit(req_id, "researcher-pipeline", "COMPLETE", "three live model responses observed and structured synthesis returned")
    return ResearchDraft.model_validate_json(final_text)


async def research(
    payload: dict[str, Any], req_id: int | None
) -> dict[str, Any]:
    prompt = payload["prompt"]
    evidence = payload.get("evidence", [])
    models = _pipeline_models()
    emit(
        req_id,
        "researcher-provider",
        "RUNNING",
        "provider=google-adk models=" + "->".join(models),
    )
    key = _key(prompt, evidence)
    emit(req_id, "cache", "RUNNING", "lookup research draft")
    cached = await _cache_get(key)
    if cached:
        emit(req_id, "cache", "COMPLETE", "hit")
        emit(req_id, "research-draft", "COMPLETE", "loaded from non-canonical cache")
        emit(req_id, "researcher-provider", "COMPLETE")
        return ResearchDraft.model_validate_json(cached).model_dump()
    emit(req_id, "cache", "COMPLETE", "miss")

    if TEST_DRAFT:
        draft = ResearchDraft.model_validate_json(
            Path(TEST_DRAFT).read_text(encoding="utf-8")
        )
    else:
        draft = await asyncio.wait_for(_adk(prompt, evidence, req_id), timeout=TIMEOUT)

    raw = draft.model_dump_json()
    await _cache_set(key, raw)
    emit(req_id, "research-draft", "COMPLETE", "structured draft validated")
    emit(req_id, "researcher-provider", "COMPLETE")
    return draft.model_dump()


async def dispatch(msg: dict[str, Any]):
    if msg.get("op") == "research":
        return await research(msg["payload"], msg.get("id"))
    if msg.get("op") == "health":
        return await asyncio.to_thread(_health)
    raise ValueError(f"unknown op {msg.get('op')}")


async def main():
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        try:
            msg = json.loads(line)
            result = await dispatch(msg)
            out = {"id": msg.get("id"), "ok": True, "result": result}
        except Exception as error:
            out = {
                "id": msg.get("id"),
                "ok": False,
                "error": f"{type(error).__name__}: {error}",
            }
        print(json.dumps(out, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
