from __future__ import annotations
import asyncio, hashlib, json, os, sys, time, urllib.request

os.environ["LITELLM_LOG"] = "ERROR"
os.environ["LITELLM_SUPPRESS_DEBUG_INFO"] = "true"

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


MODEL = os.getenv("GEMMA2_LOCAL_MODEL", "gemma2:9b")
BASE = os.getenv("OLLAMA_API_BASE", "http://localhost:11434").rstrip("/")
TTL = max(1, int(os.getenv("CACHE_TTL", "3600")))
TIMEOUT = max(1, int(os.getenv("GEMMA2_TIMEOUT_SECONDS", "300")))
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
        {"model": MODEL, "prompt": semantic},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()
    return "oneshot:adk-draft:" + hashlib.sha256(raw).hexdigest()


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
    with urllib.request.urlopen(BASE + "/api/tags", timeout=5) as r:
        data = json.loads(r.read().decode())
        return [m.get("name", "") for m in data.get("models", [])]


def _ensure_ollama():
    try:
        models = _ollama_tags()
    except Exception as e:
        raise RuntimeError(f"Ollama is not reachable at {BASE}: {e}")
    if MODEL in models:
        return
    if os.getenv("GEMMA2_AUTO_PULL", "true").lower() != "true":
        raise RuntimeError(f"{MODEL} is not installed in Ollama")
    req = urllib.request.Request(
        BASE + "/api/pull",
        data=json.dumps({"name": MODEL, "stream": False}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=3600) as r:
        if r.status != 200:
            raise RuntimeError(f"Ollama pull failed: HTTP {r.status}")


async def _build_runner():
    global _runner
    if _runner is not None:
        return _runner
    await asyncio.to_thread(_ensure_ollama)
    os.environ["OLLAMA_API_BASE"] = BASE
    from google.adk.agents.llm_agent import LlmAgent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.runners import InMemoryRunner

    model = LiteLlm(model=f"ollama_chat/{MODEL}", api_base=BASE)
    agent = LlmAgent(
        name="oneshot_researcher",
        model=model,
        include_contents="none",
        instruction=(
            "You are the Researcher model inside OneShot. Return only the structured research draft requested by the output schema. "
            "Use the supplied evidence as support for requirements and success criteria. Dependency required_by indexes refer to requirement indexes, not plan-step indexes. "
            "Derive concise requirements, dependencies, implementation plan steps, success meaning, and measurable success criteria from the user prompt. "
            "Do not invent deployment, provider, database, security, or workflow requirements that are not requested."
        ),
        output_schema=ResearchDraft,
    )
    _runner = InMemoryRunner(app_name="oneshot_researcher", agent=agent)
    return _runner


async def _adk(
    prompt: dict[str, Any], evidence: list[dict[str, Any]], req_id: int | None
) -> ResearchDraft:
    emit(req_id, "adk-runner", "RUNNING", "building Google ADK runner")
    runner = await _build_runner()
    session = await runner.session_service.create_session(
        app_name="oneshot_researcher", user_id="oneshot"
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
    texts = []
    emit(req_id, "litellm", "RUNNING", f"ollama_chat/{MODEL}")
    emit(req_id, "ollama", "RUNNING", BASE)
    emit(req_id, "gemma2", "RUNNING", MODEL)
    async for event in runner.run_async(
        user_id="oneshot", session_id=session.id, new_message=message
    ):
        final = getattr(event, "is_final_response", None)
        if callable(final) and not final():
            continue
        if event.content and event.content.parts:
            texts.extend(
                p.text
                for p in event.content.parts
                if getattr(p, "text", None)
            )
    if not texts:
        raise RuntimeError("Google ADK returned no final text response")
    emit(req_id, "gemma2", "COMPLETE", "structured response returned")
    emit(req_id, "ollama", "COMPLETE")
    emit(req_id, "litellm", "COMPLETE")
    emit(req_id, "adk-runner", "COMPLETE")
    return ResearchDraft.model_validate_json("\n".join(texts).strip())


async def research(
    payload: dict[str, Any], req_id: int | None
) -> dict[str, Any]:
    prompt = payload["prompt"]
    evidence = payload.get("evidence", [])
    emit(
        req_id,
        "researcher-provider",
        "RUNNING",
        f"provider=google-adk model={MODEL}",
    )
    key = _key(prompt, evidence)
    emit(req_id, "cache", "RUNNING", "lookup research draft")
    cached = await _cache_get(key)
    if cached:
        emit(req_id, "cache", "COMPLETE", "hit")
        emit(
            req_id,
            "research-draft",
            "COMPLETE",
            "loaded from non-canonical cache",
        )
        emit(req_id, "researcher-provider", "COMPLETE")
        return ResearchDraft.model_validate_json(cached).model_dump()
    emit(req_id, "cache", "COMPLETE", "miss")
    if TEST_DRAFT:
        draft = ResearchDraft.model_validate_json(
            Path(TEST_DRAFT).read_text(encoding="utf-8")
        )
    else:
        draft = await asyncio.wait_for(
            _adk(prompt, evidence, req_id), timeout=TIMEOUT
        )
    raw = draft.model_dump_json()
    await _cache_set(key, raw)
    emit(
        req_id, "research-draft", "COMPLETE", "structured draft validated"
    )
    emit(req_id, "researcher-provider", "COMPLETE")
    return draft.model_dump()


async def dispatch(msg: dict[str, Any]):
    if msg.get("op") == "research":
        return await research(msg["payload"], msg.get("id"))
    if msg.get("op") == "health":
        return {
            "model": MODEL,
            "ollama_api_base": BASE,
            "cache_ttl": TTL,
            "timeout_seconds": TIMEOUT,
            "test_mode": bool(TEST_DRAFT),
        }
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
        except Exception as e:
            out = {
                "id": msg.get("id"),
                "ok": False,
                "error": f"{type(e).__name__}: {e}",
            }
        print(json.dumps(out, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
