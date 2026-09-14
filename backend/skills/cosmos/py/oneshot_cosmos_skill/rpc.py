"""JSON-RPC stdin/stdout server for the Cosmos skill."""
from __future__ import annotations

import json
import sys
from typing import Any, Callable, Iterator

from oneshot_cosmos_skill.config import CosmosSkillConfig
from oneshot_cosmos_skill.models import CosmosModelService
from oneshot_cosmos_skill.tools import build_tools


def _read_requests() -> Iterator[dict[str, Any]]:
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            yield json.loads(line)
        except json.JSONDecodeError as exc:
            _send_response(None, error=f"Invalid JSON: {exc}")


def _send_response(req_id: Any, *, result: Any = None, error: str | None = None) -> None:
    payload: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id}
    if error:
        payload["error"] = {"message": error}
    else:
        payload["result"] = result
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


class CosmosRpcServer:
    def __init__(self, config: CosmosSkillConfig) -> None:
        self.service = CosmosModelService(config)
        self.tools: dict[str, Callable[..., Any]] = {}

    def set_groups(self, enabled_groups: list[str]) -> None:
        self.tools = build_tools(self.service, enabled_groups)

    def _handle(self, method: str, params: dict[str, Any]) -> Any:
        if method == "health":
            return {"ok": True}
        if method == "set_groups":
            self.set_groups(params.get("groups", []))
            return {"ok": True}
        if method == "reason":
            return self.service.reason(params["prompt"], params.get("media"))
        if method == "vision":
            return self.service.vision(params["prompt"], params["media"])
        if method == "generate":
            return self.service.generate(
                params["mode"],
                params["prompt"],
                params.get("image_path"),
                params["out_path"],
            )
        if method == "tool":
            name = params["name"]
            if name not in self.tools:
                raise KeyError(f"Tool not enabled: {name}")
            return self.tools[name](params.get("input", {}))
        raise ValueError(f"Unknown method: {method}")

    def serve(self) -> None:
        for req in _read_requests():
            if "error" in req:
                _send_response(None, error=req["error"])
                continue
            try:
                result = self._handle(
                    req.get("method", ""), req.get("params", {})
                )
                _send_response(req.get("id"), result=result)
            except Exception as exc:  # noqa: BLE001
                _send_response(req.get("id"), error=str(exc))


def main() -> int:
    config = CosmosSkillConfig.from_env()
    CosmosRpcServer(config).serve()
    return 0
