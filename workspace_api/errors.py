"""Stable application error taxonomy and FastAPI error responses.

All expected failures use ``{"error": ...}`` with a machine-readable code,
request correlation ID, retryability flag, and safe details.

Example::

    raise NotFoundError("workspace", workspace_id)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("oneshot.workspace.errors")


class AppError(Exception):
    """Base expected error safe to serialize to an API caller."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.details = details or {}


class AuthenticationError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__("AUTHENTICATION_REQUIRED", message, status_code=401)


class AuthorizationError(AppError):
    def __init__(self, message: str = "Insufficient workspace permission") -> None:
        super().__init__("FORBIDDEN", message, status_code=403)


class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: str) -> None:
        super().__init__(
            "NOT_FOUND",
            f"{resource} was not found",
            status_code=404,
            details={"resource": resource, "id": resource_id},
        )


class ConflictError(AppError):
    def __init__(self, message: str, **details: Any) -> None:
        super().__init__("CONFLICT", message, status_code=409, details=details)


class RateLimitError(AppError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            "RATE_LIMITED",
            "Rate limit exceeded",
            status_code=429,
            retryable=True,
            details={"retry_after_seconds": retry_after_seconds},
        )


class QuotaExceededError(AppError):
    def __init__(self, quota: str, limit: str) -> None:
        super().__init__(
            "QUOTA_EXCEEDED",
            f"Workspace {quota} quota is exhausted",
            status_code=429,
            details={"quota": quota, "limit": limit},
        )


class ProviderError(AppError):
    def __init__(
        self,
        provider: str,
        message: str,
        *,
        retryable: bool = True,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            "PROVIDER_ERROR",
            message,
            status_code=502,
            retryable=retryable,
            details={"provider": provider, **(details or {})},
        )


def _payload(request: Request, error: AppError) -> dict[str, Any]:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable,
            "request_id": getattr(request.state, "request_id", None),
            "details": error.details,
        }
    }


def register_error_handlers(app: FastAPI) -> None:
    """Attach expected, validation, and unexpected exception handlers."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, error: AppError) -> JSONResponse:
        headers = {}
        if isinstance(error, AuthenticationError):
            headers["WWW-Authenticate"] = "Bearer"
        if isinstance(error, RateLimitError):
            headers["Retry-After"] = str(error.details["retry_after_seconds"])
        return JSONResponse(
            status_code=error.status_code,
            content=_payload(request, error),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        app_error = AppError(
            "VALIDATION_ERROR",
            "Request validation failed",
            status_code=422,
            details={
                "violations": [
                    {
                        "type": violation.get("type"),
                        "location": list(violation.get("loc", ())),
                        "message": violation.get("msg"),
                    }
                    for violation in error.errors()
                ]
            },
        )
        return JSONResponse(status_code=422, content=_payload(request, app_error))

    @app.exception_handler(IntegrityError)
    async def integrity_handler(
        request: Request, error: IntegrityError
    ) -> JSONResponse:
        logger.info(
            "database_integrity_conflict",
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        app_error = ConflictError("The requested resource conflicts with existing data")
        return JSONResponse(status_code=409, content=_payload(request, app_error))

    @app.exception_handler(Exception)
    async def unexpected_handler(request: Request, error: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_request_error",
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        app_error = AppError(
            "INTERNAL_ERROR",
            "An unexpected server error occurred",
            status_code=500,
            retryable=False,
        )
        return JSONResponse(status_code=500, content=_payload(request, app_error))
