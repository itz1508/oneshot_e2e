"""Server-side native provider transport. No response/error bodies enter diagnostics."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

from _worker_common import ResearchDraft, extract_json_content, serve


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SafeFailure(Exception):
    pass


class DraftInvalid(Exception):
    pass


def _parse_draft(raw: str) -> ResearchDraft:
    """Validate a raw model reply against the strict ResearchDraft schema.

    Raises DraftInvalid with the concrete reason so the feedback retry loop
    can echo it back to the model. Never embeds credentials or evidence.
    """
    from _worker_common import extract_json_content

    try:
        draft = ResearchDraft.model_validate_json(extract_json_content(raw))
    except Exception as exc:
        raise DraftInvalid(
            str(exc).splitlines()[0] if str(exc) else "invalid JSON"
        ) from None
    indexes = [x.required_by for x in draft.dependencies] + [
        x.requirement_indexes for x in [*draft.plan_steps, *draft.success_criteria]
    ]
    if any(i < 0 or i >= len(draft.requirements) for group in indexes for i in group):
        raise DraftInvalid(
            "requirement_indexes must be zero-based indexes into the requirements array"
        )
    return draft


def main():
    provider = sys.argv[1]
    if provider not in {"openai", "anthropic", "gemini"}:
        raise SystemExit("Unsupported provider")
    prefix = provider.upper()
    key = os.getenv(prefix + "_API_KEY", "").strip()
    base = os.getenv(prefix + "_API_BASE", "").rstrip("/")
    if not base:
        if provider == "openai":
            base = "https://api.openai.com/v1"
        elif provider == "anthropic":
            base = "https://api.anthropic.com/v1"
        elif provider == "gemini":
            base = "https://generativelanguage.googleapis.com/v1beta"
    timeout = int(os.getenv(prefix + "_TIMEOUT_SECONDS", "300"))
    max_tokens = int(os.getenv(prefix + "_MAX_TOKENS", "4096"))
    temperature = os.getenv(prefix + "_TEMPERATURE", "")
    model = os.getenv(prefix + "_MODEL", "").strip()
    if model:
        models = [model]
    elif provider == "gemini":
        stage_models = [
            os.getenv("GEMINI_" + stage + "_MODEL", "").strip()
            for stage in ("DISTRIBUTION", "RESEARCH", "SYNTHESIS")
        ]
        models = list(dict.fromkeys([m for m in stage_models if m]))
    else:
        models = []
    test_draft = (
        os.getenv("ONESHOT_" + prefix + "_TEST_DRAFT_FILE", "")
        if os.getenv("ONESHOT_MODE") == "test"
        else ""
    )
    opener = build_opener(NoRedirect())

    def generate(model_id, text, structured=False):
        if not key:
            raise SafeFailure("Provider credential is not configured")
        headers = {"Content-Type": "application/json"}
        options = {"temperature": float(temperature)} if temperature else {}
        if provider == "openai":
            headers["Authorization"] = "Bearer " + key
            url = base + "/chat/completions"
            payload = {
                "model": model_id,
                "messages": [{"role": "user", "content": text}],
                "max_completion_tokens": max_tokens if structured else 32,
                **options,
            }
            if structured:
                payload["response_format"] = {"type": "json_object"}
        elif provider == "anthropic":
            headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
            url = base + "/messages"
            payload = {
                "model": model_id,
                "messages": [{"role": "user", "content": text}],
                "max_tokens": max_tokens if structured else 32,
                **options,
            }
        else:
            headers["x-goog-api-key"] = key
            url = (
                base
                + "/models/"
                + quote(model_id.removeprefix("models/"), safe="")
                + ":generateContent"
            )
            config = {"maxOutputTokens": max_tokens if structured else 64, **options}
            if structured:
                config["responseMimeType"] = "application/json"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": text}]}],
                "generationConfig": config,
            }
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
                result = "".join(
                    part["text"]
                    for part in data["content"]
                    if part.get("type") == "text"
                )
            else:
                result = "".join(
                    part.get("text", "")
                    for part in data["candidates"][0]["content"]["parts"]
                )
            if not isinstance(result, str) or not result.strip():
                raise SafeFailure("Provider returned no text")
            return result
        except HTTPError as error:
            raise SafeFailure(f"Provider request failed (HTTP {error.code})") from None
        except SafeFailure:
            raise
        except Exception:
            raise SafeFailure(
                "Provider request failed or returned an invalid response"
            ) from None

    def dispatch(message):
        op = message.get("op")
        if op == "health":
            if test_draft:
                ResearchDraft.model_validate_json(
                    Path(test_draft).read_text(encoding="utf-8")
                )
            else:
                for selected in models:
                    generate(selected, "Reply with OK.")
            return {
                "ready": True,
                "provider": provider,
                "model": models[-1] if models else model,
                "models": models,
                "api_base": base,
                "backend": "gemini-api" if provider == "gemini" else f"{provider}-api",
                "detail": (
                    "Live model connection verified"
                    if not test_draft
                    else "Explicit deterministic test"
                ),
            }
        if op == "research":
            if test_draft:
                raw = Path(test_draft).read_text(encoding="utf-8")
                draft = _parse_draft(raw)
            else:
                payload = message["payload"]
                text = (
                    "You are OneShot Researcher. Return one JSON object matching output_schema. "
                    "Use only supplied evidence. Preserve all explicit user constraints and commands. "
                    "All requirement indexes are zero-based indexes into requirements. "
                    "Supply the requested user-facing text artifact in deliverable when applicable. "
                    "Do not invent facts or unrelated architecture.\n"
                    + json.dumps(
                        {
                            "prompt": payload["prompt"],
                            "evidence": payload.get("evidence", []),
                            "output_schema": ResearchDraft.model_json_schema(),
                        }
                    )
                )
                # Small local models frequently miss a strict-schema detail on the
                # first attempt. Re-prompt with the concrete validation errors so
                # the model can correct its own output before the run fails.
                retries = max(
                    0, int(os.getenv("ONESHOT_PROVIDER_DRAFT_RETRIES", "2") or "0")
                )
                raw = generate(models[-1], text, structured=True)
                draft = None
                for attempt in range(retries + 1):
                    try:
                        draft = _parse_draft(raw)
                        break
                    except DraftInvalid as invalid:
                        if attempt >= retries:
                            raise SafeFailure(
                                "Provider response failed validation"
                            ) from None
                        raw = generate(
                            models[-1],
                            text
                            + "\n\nYour previous reply was:\n"
                            + raw
                            + "\n\nIt was rejected by the schema validator: "
                            + str(invalid)
                            + "\nReturn the corrected single JSON object only. No prose.",
                            structured=True,
                        )
                if draft is None:
                    raise SafeFailure("Provider response failed validation")
            return draft.model_dump()
        raise SafeFailure("Unsupported provider operation")

    def format_error(error):
        return (
            str(error)
            if isinstance(error, SafeFailure)
            else "Provider response failed validation"
        )

    serve(dispatch, format_error)


if __name__ == "__main__":
    main()
