from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import time
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
    deliverable: str = Field(min_length=1)


TEST_DRAFT = os.getenv("ONESHOT_ADK_TEST_DRAFT_FILE", "").strip()
DISTRIBUTION_MODEL = (
    os.getenv("GEMINI_DISTRIBUTION_MODEL", "").strip()
    or (os.getenv("GEMMA2_DISTRIBUTION_MODEL", "").strip() if TEST_DRAFT else "")
)
RESEARCH_MODEL = (
    os.getenv("GEMINI_RESEARCH_MODEL", "").strip()
    or (os.getenv("GEMMA2_RESEARCH_MODEL", "").strip() if TEST_DRAFT else "")
)
SYNTHESIS_MODEL = (
    os.getenv("GEMINI_SYNTHESIS_MODEL", "").strip()
    or (os.getenv("GEMMA2_SYNTHESIS_MODEL", "").strip() if TEST_DRAFT else "")
)
PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global").strip() or "global"
USE_VERTEX = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
TTL = max(1, int(os.getenv("CACHE_TTL", "3600")))
TIMEOUT = max(1, int(os.getenv("GEMINI_TIMEOUT_SECONDS", "300")))
REFINEMENT_ATTEMPTS = max(
    1, int(os.getenv("GEMINI_REFINEMENT_ATTEMPTS", "3"))
)
MAX_OUTPUT_TOKENS = max(
    512, int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "3072"))
)
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


def _backend() -> str:
    if TEST_DRAFT:
        return "deterministic-test"
    return "vertex-ai" if USE_VERTEX else "gemini-api"


def _pipeline_models() -> list[str]:
    models = [DISTRIBUTION_MODEL, RESEARCH_MODEL, SYNTHESIS_MODEL]
    if any(not model for model in models):
        raise RuntimeError(
            "Researcher Gemini pipeline is not fully bound: distribution, research, and synthesis models are required"
        )
    if not TEST_DRAFT and len(set(models)) != 3:
        raise RuntimeError(
            "Researcher Gemini pipeline requires three distinct model bindings"
        )
    return models


def _prompt_text(prompt: dict[str, Any]) -> str:
    parts = [
        str(prompt.get("intent", "")),
        str(prompt.get("requested_outcome", "")),
    ]
    parts.extend(
        str(item.get("statement", ""))
        for item in prompt.get("context", [])
        if isinstance(item, dict)
    )
    parts.extend(
        str(item)
        for item in prompt.get("research_direction", [])
        if isinstance(item, str)
    )
    return "\n".join(part for part in parts if part).strip()


def _draft_semantic_issues(
    prompt: dict[str, Any], draft: ResearchDraft
) -> list[str]:
    issues: list[str] = []
    requirement_count = len(draft.requirements)

    def validate_indexes(label: str, indexes: list[int]):
        invalid = sorted(
            {
                index
                for index in indexes
                if index < 0 or index >= requirement_count
            }
        )
        if invalid:
            issues.append(
                f"{label} contains requirement indexes outside 0..{requirement_count - 1}: {invalid}"
            )

    for index, dependency in enumerate(draft.dependencies):
        validate_indexes(f"dependencies[{index}].required_by", dependency.required_by)
    for index, step in enumerate(draft.plan_steps):
        validate_indexes(
            f"plan_steps[{index}].requirement_indexes", step.requirement_indexes
        )
    for index, criterion in enumerate(draft.success_criteria):
        validate_indexes(
            f"success_criteria[{index}].requirement_indexes",
            criterion.requirement_indexes,
        )

    prompt_text = _prompt_text(prompt)
    lower = prompt_text.lower()
    requires_node_commands = (
        "every plan step description" in lower
        and ("beginning with node" in lower or "direct shell command" in lower)
    )
    if requires_node_commands:
        for index, step in enumerate(draft.plan_steps):
            command = step.description.strip()
            if not (command == "node" or command.startswith("node ")):
                issues.append(
                    f"plan_steps[{index}].description reduced explicit executable requirement; expected command beginning with node"
                )

    literal_markers = [
        "BEFORE_VERIFY target_files_absent=true",
        "PRODUCT_VERIFY mp4=true mp3=true wav=false",
    ]
    for marker in literal_markers:
        if marker in prompt_text and not any(
            marker in step.description for step in draft.plan_steps
        ):
            issues.append(
                f"plan_steps omitted explicit verification marker: {marker}"
            )

    if (
        "final step must run node verify.js" in lower
        and draft.plan_steps[-1].description.strip() != "node verify.js"
    ):
        issues.append(
            "final plan step reduced explicit requirement; expected exactly node verify.js"
        )

    return issues


def _refinement_feedback(error: Exception) -> str:
    detail = _preview(str(error), 900)
    return (
        "NOT_VALID refinement required for the same Prompt(id). "
        "The previous synthesis was malformed or reduced explicit user value. "
        "Do not remove, weaken, summarize away, or replace any explicit requested behavior or constraint. "
        "Return one concise valid ResearchDraft. "
        "All required_by and requirement_indexes values are zero-based positions in the actual requirements array; "
        "use only indexes that exist and never enumerate indexes beyond that array. "
        "If the Prompt(id) explicitly requires executable plan-step commands or literal verification markers, preserve them exactly in plan_steps.description. "
        f"Previous issue: {detail}"
    )


def _refinable_draft_error(error: Exception) -> bool:
    return str(error).startswith("NOT_VALID ")


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
        {"models": _pipeline_models(), "backend": _backend(), "prompt": semantic},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()
    return "oneshot:adk-gemini-draft:" + hashlib.sha256(raw).hexdigest()


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


async def _cache_delete(key: str):
    if _redis:
        try:
            await _redis.delete(key)
        except Exception:
            pass
    _cache.pop(key, None)


def _probe_client():
    from google import genai

    if USE_VERTEX:
        if not PROJECT:
            raise RuntimeError(
                "GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true"
            )
        return genai.Client(vertexai=True, project=PROJECT, location=LOCATION)

    api_key = (
        os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY or GOOGLE_API_KEY is required when Vertex AI is disabled"
        )
    return genai.Client(api_key=api_key)


def _health() -> dict[str, Any]:
    models = _pipeline_models()
    backend = _backend()
    if TEST_DRAFT:
        return {
            "ready": True,
            "provider": "google-adk",
            "models": models,
            "backend": backend,
            "google_cloud_project": PROJECT or None,
            "google_cloud_location": LOCATION,
            "detail": "deterministic adapter draft configured",
        }

    try:
        client = _probe_client()
        responses: list[str] = []
        for index, model in enumerate(models, start=1):
            response = client.models.generate_content(
                model=model,
                contents=(
                    "Return exactly this token and nothing else: "
                    f"ONESHOT_MODEL_{index}_OK"
                ),
            )
            text = (response.text or "").strip()
            responses.append(f"{model}={_preview(text, 100)}")
        return {
            "ready": True,
            "provider": "google-adk",
            "models": models,
            "backend": backend,
            "google_cloud_project": PROJECT or None,
            "google_cloud_location": LOCATION,
            "detail": "live model probes completed: " + " | ".join(responses),
        }
    except Exception as error:
        return {
            "ready": False,
            "provider": "google-adk",
            "models": models,
            "backend": backend,
            "google_cloud_project": PROJECT or None,
            "google_cloud_location": LOCATION,
            "detail": f"live Gemini readiness failed: {type(error).__name__}: {error}",
        }


async def _build_runner():
    global _runner
    if _runner is not None:
        return _runner

    _pipeline_models()

    from google.adk.agents import LlmAgent, SequentialAgent
    from google.adk.models import Gemini
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    distribution_agent = LlmAgent(
        name="ResearcherDistribution",
        model=Gemini(model=DISTRIBUTION_MODEL),
        instruction=(
            "You are the distribution stage of the OneShot Researcher pipeline. "
            "Read the job-specific Prompt(id), supplied repository evidence, and any refinement_feedback. "
            "In at most 8 short bullets, identify exactly what the research stage must preserve: requested behavior, evidence, constraints, executable steps, and measurable success. "
            "If refinement_feedback exists, explicitly correct that prior defect without reducing any user requirement. "
            "Do not produce the final ResearchDraft, do not add architecture, and do not invent repository facts. Be concise."
        ),
        generate_content_config=types.GenerateContentConfig(max_output_tokens=384),
        output_key="research_distribution",
    )

    research_agent = LlmAgent(
        name="ResearcherResearch",
        model=Gemini(model=RESEARCH_MODEL),
        instruction=(
            "You are the research stage of the OneShot Researcher pipeline. "
            "Use the job-specific Prompt(id), supplied evidence, preceding distribution analysis, and any refinement_feedback. "
            "Return a concise candidate with requirements, dependencies, executable plan steps, and measurable criteria. "
            "Requirements and success criteria must be grounded in supplied evidence. "
            "Dependency required_by indexes refer to zero-based requirement indexes, not plan-step indexes, and may only reference indexes that exist. "
            "If the request asks for executable sandbox implementation steps, preserve the exact requested commands and verification strings and propose direct commands without Markdown fences. "
            "If refinement_feedback exists, correct the prior defect while preserving all previously requested value. "
            "Do not invent deployment, provider, database, security, or workflow requirements that are not requested. Keep the response under 700 words."
        ),
        generate_content_config=types.GenerateContentConfig(max_output_tokens=768),
        output_key="research_candidate",
    )

    synthesis_agent = LlmAgent(
        name="ResearcherSynthesis",
        model=Gemini(model=SYNTHESIS_MODEL),
        instruction=(
            "You are the synthesis stage of the OneShot Researcher pipeline. "
            "Review the original job-specific Prompt(id), evidence, distribution analysis, research candidate, and any refinement_feedback. "
            "Return one final ResearchDraft only. "
            "Keep only evidence-backed requirements, dependencies, implementation steps, success meaning, and measurable success criteria. "
            "Every required_by and requirement_indexes value is a zero-based index into the final requirements array and must be less than the number of final requirements; never enumerate indexes beyond the actual requirements. "
            "When the user explicitly asks for executable sandbox implementation, every plan_steps.description must be a directly executable command beginning with the exact command prefix requested by the user; never use Markdown or explanatory prose. "
            "Preserve literal verification strings requested by the user so execution evidence can prove behavior. "
            "If refinement_feedback exists, correct that prior NOT_VALID defect and preserve all explicit user value. "
            "The deliverable field is the complete, production-quality user-requested artifact that Builder must return after canonical validation and execution. "
            "Generate the deliverable from the user's requested outcome; do not merely repeat the requirement bullets. "
            "For evaluation or judging artifacts, distinguish observed evidence from inference and never fabricate verification results. "
            "Correct inconsistencies without inventing unsupported facts."
        ),
        generate_content_config=types.GenerateContentConfig(
            max_output_tokens=MAX_OUTPUT_TOKENS
        ),
        output_schema=ResearchDraft,
        output_key="research_final",
    )

    pipeline = SequentialAgent(
        name="OneShotResearcherPipeline",
        sub_agents=[distribution_agent, research_agent, synthesis_agent],
        description="Three-model distribution -> research -> synthesis pipeline.",
    )
    _runner = InMemoryRunner(
        app_name="oneshot_researcher_pipeline", agent=pipeline
    )
    return _runner


async def _adk(
    prompt: dict[str, Any],
    evidence: list[dict[str, Any]],
    req_id: int | None,
    refinement_feedback: str = "",
) -> ResearchDraft:
    emit(
        req_id,
        "researcher-pipeline",
        "RUNNING",
        "distribution -> research -> synthesis",
    )
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
                    {
                        "prompt": prompt,
                        "evidence": evidence,
                        "refinement_feedback": refinement_feedback,
                    },
                    ensure_ascii=False,
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
    emit(
        req_id,
        "researcher-pipeline",
        "COMPLETE",
        "three live Gemini model responses observed and structured synthesis returned",
    )
    try:
        draft = ResearchDraft.model_validate_json(final_text)
    except Exception as error:
        raise RuntimeError(
            f"NOT_VALID structured synthesis: {type(error).__name__}: {error}"
        ) from error

    issues = _draft_semantic_issues(prompt, draft)
    if issues:
        raise RuntimeError("NOT_VALID research draft: " + "; ".join(issues))
    return draft


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
        f"provider=google-adk backend={_backend()} models=" + "->".join(models),
    )
    key = _key(prompt, evidence)
    emit(req_id, "cache", "RUNNING", "lookup research draft")
    cached = await _cache_get(key)
    if cached:
        try:
            cached_draft = ResearchDraft.model_validate_json(cached)
            cached_issues = _draft_semantic_issues(prompt, cached_draft)
        except Exception as error:
            cached_draft = None
            cached_issues = [
                f"cached draft invalid: {type(error).__name__}: {error}"
            ]
        if cached_draft is not None and not cached_issues:
            emit(req_id, "cache", "COMPLETE", "hit")
            emit(
                req_id,
                "research-draft",
                "COMPLETE",
                "loaded from non-canonical cache",
            )
            emit(req_id, "researcher-provider", "COMPLETE")
            return cached_draft.model_dump()
        await _cache_delete(key)
        emit(
            req_id,
            "cache",
            "COMPLETE",
            "discarded cached draft because explicit Prompt(id) value was not preserved",
        )
    else:
        emit(req_id, "cache", "COMPLETE", "miss")

    if TEST_DRAFT:
        draft = ResearchDraft.model_validate_json(
            Path(TEST_DRAFT).read_text(encoding="utf-8")
        )
        issues = _draft_semantic_issues(prompt, draft)
        if issues:
            raise RuntimeError(
                "NOT_VALID deterministic adapter draft: " + "; ".join(issues)
            )
    else:
        refinement_feedback = ""
        last_error: Exception | None = None
        for attempt in range(1, REFINEMENT_ATTEMPTS + 1):
            try:
                draft = await asyncio.wait_for(
                    _adk(
                        prompt,
                        evidence,
                        req_id,
                        refinement_feedback=refinement_feedback,
                    ),
                    timeout=TIMEOUT,
                )
                if attempt > 1:
                    emit(
                        req_id,
                        "research-draft-refinement",
                        "COMPLETE",
                        f"VALID after attempt={attempt}; same Prompt(id) preserved",
                    )
                break
            except Exception as error:
                last_error = error
                if (
                    attempt >= REFINEMENT_ATTEMPTS
                    or not _refinable_draft_error(error)
                ):
                    raise
                refinement_feedback = _refinement_feedback(error)
                emit(
                    req_id,
                    "research-draft-refinement",
                    "RUNNING",
                    f"NOT_VALID attempt={attempt}; retrying same Prompt(id): {_preview(str(error), 700)}",
                )
        else:
            assert last_error is not None
            raise last_error

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
