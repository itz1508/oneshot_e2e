from __future__ import annotations

import json
import os
import sys
from typing import Any

from tavily import TavilyClient


def _client() -> TavilyClient:
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is required for OneShot Tavily research")
    return TavilyClient(api_key=api_key)


def _search(client: TavilyClient, request: dict[str, Any]) -> dict[str, Any]:
    return client.search(
        query=str(request["query"]),
        include_answer=request.get("include_answer", "advanced"),
        search_depth=request.get("search_depth", "advanced"),
        max_results=int(request.get("max_results", 5)),
    )


def _extract(client: TavilyClient, request: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"urls": list(request["urls"])}
    if request.get("extract_depth"):
        kwargs["extract_depth"] = request["extract_depth"]
    if request.get("format"):
        kwargs["format"] = request["format"]
    if request.get("query"):
        kwargs["query"] = request["query"]
    return client.extract(**kwargs)


def _research_stream(
    client: TavilyClient, request: dict[str, Any]
) -> dict[str, Any]:
    stream = client.research(
        input=str(request["query"]),
        model=request.get("model", "mini"),
        stream=True,
        citation_format=request.get("citation_format", "numbered"),
    )

    report: list[str] = []
    progress: list[dict[str, Any]] = []
    event_type: str | None = None

    for chunk in stream:
        text = chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("event:"):
                event_type = line.split("event:", 1)[1].strip()
                continue
            if not line.startswith("data:"):
                continue

            payload = line.split("data:", 1)[1].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if event_type != "chat.completion.chunk":
                continue

            delta = data.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if isinstance(content, str) and content:
                report.append(content)
                continue

            step = delta.get("step_details")
            if isinstance(step, dict):
                step_type = str(step.get("type", ""))
                # Tavily can emit a `think` step. OneShot intentionally does not
                # persist or expose hidden reasoning; only observable research
                # plan/progress is retained.
                if step_type in {"research_plan", "research"}:
                    progress.append(
                        {
                            "type": step_type,
                            "step": str(step.get("step", "")),
                        }
                    )
                continue

            tool_calls = delta.get("tool_calls")
            if isinstance(tool_calls, dict):
                call_type = tool_calls.get("type")
                items = tool_calls.get(call_type, []) if call_type else []
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict) and item.get("arguments"):
                            progress.append(
                                {
                                    "type": "tool_call",
                                    "arguments": item["arguments"],
                                }
                            )

    return {"report": "".join(report).strip(), "progress": progress}


def main() -> None:
    request = json.load(sys.stdin)
    operation = request.get("op")
    client = _client()

    if operation == "search":
        result = _search(client, request)
    elif operation == "extract":
        result = _extract(client, request)
    elif operation == "research_stream":
        result = _research_stream(client, request)
    else:
        raise RuntimeError(f"unsupported Tavily operation: {operation!r}")

    print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"{type(error).__name__}: {error}",
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)
