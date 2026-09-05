"""Structured logging and request correlation middleware.

The middleware accepts a valid incoming ``X-Request-ID`` or creates a UUID,
stores it on ``request.state``, includes it in logs, and returns it to callers.

Example::

    configure_logging(settings)
    app.add_middleware(RequestContextMiddleware)
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from workspace_api.config import WorkspaceSettings

REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")


class JsonFormatter(logging.Formatter):
    """Small JSON formatter that preserves selected structured attributes."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for name in (
            "request_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "workspace_id",
            "model_config_id",
        ):
            value = getattr(record, name, None)
            if value is not None:
                payload[name] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(settings: WorkspaceSettings) -> None:
    """Configure the process root logger once from typed settings."""

    handler = logging.StreamHandler(sys.stdout)
    if settings.log_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Add request correlation and one completion log per HTTP request."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if REQUEST_ID.fullmatch(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 3)
        response.headers["X-Request-ID"] = request_id
        logging.getLogger("oneshot.workspace.http").info(
            "request_complete",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
