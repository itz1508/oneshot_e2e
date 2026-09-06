"""Server-side native provider transport. No response/error bodies enter diagnostics."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

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


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SafeFailure(Exception):
    pass


def main():
    provider = sys.argv[1]
    if provider not in {"openai", "anthropic", "gemini"}:
        raise SystemExit("Unsupported provider")
    prefix = provider.upper()
    key = os.getenv(prefix + "_API_KEY", "").strip()
    base = os.getenv(prefix + "_API_BASE", "").rstrip("/")
    timeout = int(os.getenv(prefix + "_TIMEOUT_SECONDS", "300"))
    max_tokens = int(os.getenv(prefix + "_MAX_TOKENS", "4096"))
    temperature = os.getenv(prefix + "_TEMPERATURE", "")
    model = os.getenv(prefix + "_MODEL", "")
    models = list(dict.fromkeys(
        [os.getenv("GEMINI_" + stage + "_MODEL", "") for stage in ("DISTRIBUTION", "RESEARCH", "SYNTHESIS")]
        if provider == "gemini" else [model]
    ))
    test_draft = os.getenv("ONESHOT_" + prefix + "_TEST_DRAFT_FILE", "") if os.getenv("ONESHOT_MODE") == "test" else ""
    opener = build_opener(NoRedirect())

    def generate(model_id, text, structured=False):
        if not key:
            raise SafeFailure("Provider credential is not configured")
        headers = {"Content-Type": "application/json"}
        options = {"temperature": float(temperature)} if temperature else {}
        if provider == "openai":
            headers["Authorization"] = "Bearer " + key
            url = base + "/chat/completions"
            payload = {"model": model_id, "messages": [{"role": "user", "content": text}],
                       "max_completion_tokens": max_tokens if structured else 32, **options}
            if structured:
                payload["response_format"] = {"type": "json_object"}
        elif provider == "anthropic":
            headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
            url = base + "/messages"
            payload = {"model": model_id, "messages": [{"role": "user", "content": text}],
                       "max_tokens": max_tokens if structured else 32, **options}
        else:
            headers["x-goog-api-key"] = key
            url = base + "/models/" + quote(model_id.removeprefix("models/"), safe="") + ":generateContent"
            config = {"maxOutputTokens": max_tokens if structured else 64, **options}
            if structured:
                config["responseMimeType"] = "application/json"
            payload = {"contents": [{"role": "user", "parts": [{"text": text}]}],
                       "generationConfig": config}
        try:
            req = Request(url, data=json.dumps(payload).encode(), headers=headers)
            with opener.open(req, timeout=timeout) as response:
                raw = response.read(4 * 1024 * 1024)
            # A remote service must not be able to echo the credential into artifacts/events.
            if key and key.encode() in raw:
                raise SafeFailure("Provider returned sensitive material")
            data = json.loads(raw)
            if provider == "openai":
                result = data["choices"][0]["message"]["content"]
            elif provider == "anthropic":
                result = "".join(part["text"] for part in data["content"] if part.get("type") == "text")
            else:
                result = "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"])
            if not isinstance(result, str) or not result.strip():
                raise SafeFailure("Provider returned no text")
            return result
        except HTTPError as error:
            raise SafeFailure(f"Provider request failed (HTTP {error.code})") from None
        except SafeFailure:
            raise
        except Exception:
            raise SafeFailure("Provider request failed or returned an invalid response") from None

    for line in sys.stdin:
        message = {}
        try:
            message = json.loads(line)
            op = message.get("op")
            if op == "health":
                if test_draft:
                    ResearchDraft.model_validate_json(Path(test_draft).read_text(encoding="utf-8"))
                else:
                    for selected in models:
                        generate(selected, "Reply with OK.")
                result = {"ready": True, "provider": provider, "model": models[-1],
                          "models": models, "api_base": base, "backend": "gemini-api",
                          "detail": "Live model connection verified" if not test_draft else "Explicit deterministic test"}
            elif op == "research":
                if test_draft:
                    raw = Path(test_draft).read_text(encoding="utf-8")
                else:
                    payload = message["payload"]
                    text = ("You are OneShot Researcher. Return one JSON object matching output_schema. "
                            "Use only supplied evidence. Preserve all explicit user constraints and commands. "
                            "All requirement indexes are zero-based indexes into requirements. "
                            "Do not invent facts or unrelated architecture.\n" +
                            json.dumps({"prompt": payload["prompt"], "evidence": payload.get("evidence", []),
                                        "output_schema": ResearchDraft.model_json_schema()}))
                    raw = generate(models[-1], text, structured=True)
                fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", raw.strip(), re.DOTALL)
                draft = ResearchDraft.model_validate_json(fenced.group(1) if fenced else raw)
                indexes = [x.required_by for x in draft.dependencies] + [
                    x.requirement_indexes for x in [*draft.plan_steps, *draft.success_criteria]]
                if any(i < 0 or i >= len(draft.requirements) for group in indexes for i in group):
                    raise SafeFailure("Provider returned invalid requirement references")
                result = draft.model_dump()
            else:
                raise SafeFailure("Unsupported provider operation")
            output = {"id": message.get("id"), "ok": True, "result": result}
        except Exception as error:
            output = {"id": message.get("id"), "ok": False,
                      "error": str(error) if isinstance(error, SafeFailure) else "Provider response failed validation"}
        print(json.dumps(output, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
