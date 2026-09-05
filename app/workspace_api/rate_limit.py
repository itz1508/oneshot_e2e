"""Process-local and Redis-backed fixed-window rate limiting middleware.

The Redis implementation performs ``INCR`` and first-window ``EXPIRE`` in one
Lua script. The memory backend is suitable for one-process development only.

Example::

    limiter = MemoryRateLimiter()
    app.add_middleware(RateLimitMiddleware, limiter=limiter, limit=120, window=60)
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass
from typing import Protocol

from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_after_seconds: int


class RateLimiter(Protocol):
    """Storage-independent rate limiter contract."""

    async def check(self, key: str, limit: int, window: int) -> RateLimitDecision: ...

    async def close(self) -> None: ...


class MemoryRateLimiter:
    """Concurrency-safe fixed-window limiter for local single-process use."""

    def __init__(self) -> None:
        self._windows: dict[str, tuple[int, float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str, limit: int, window: int) -> RateLimitDecision:
        now = time.monotonic()
        async with self._lock:
            count, expires = self._windows.get(key, (0, now + window))
            if expires <= now:
                count, expires = 0, now + window
            count += 1
            self._windows[key] = (count, expires)
            if len(self._windows) > 10_000:
                self._windows = {
                    item_key: value
                    for item_key, value in self._windows.items()
                    if value[1] > now
                }
        return RateLimitDecision(
            allowed=count <= limit,
            limit=limit,
            remaining=max(0, limit - count),
            reset_after_seconds=max(1, int(expires - now) + 1),
        )

    async def close(self) -> None:
        """No-op for interface parity with the Redis backend."""


class RedisRateLimiter:
    """Distributed fixed-window limiter using an atomic Redis Lua script."""

    SCRIPT = """
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('TTL', KEYS[1])
    return {current, ttl}
    """

    def __init__(self, url: str, *, fail_open: bool = False) -> None:
        self._redis = Redis.from_url(url, decode_responses=True)
        self._fail_open = fail_open

    async def check(self, key: str, limit: int, window: int) -> RateLimitDecision:
        try:
            current, ttl = await self._redis.eval(
                self.SCRIPT, 1, f"oneshot:rate:{key}", window
            )
            count = int(current)
            reset = max(1, int(ttl))
            return RateLimitDecision(
                allowed=count <= limit,
                limit=limit,
                remaining=max(0, limit - count),
                reset_after_seconds=reset,
            )
        except Exception:
            if self._fail_open:
                return RateLimitDecision(True, limit, limit, window)
            return RateLimitDecision(False, limit, 0, window)

    async def close(self) -> None:
        """Close the Redis connection pool."""

        await self._redis.aclose()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply a coarse edge limit keyed by credential fingerprint or client IP."""

    EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

    def __init__(
        self,
        app,
        *,
        limiter: RateLimiter,
        limit: int,
        window: int,
    ) -> None:
        super().__init__(app)
        self.limiter = limiter
        self.limit = limit
        self.window = window

    @staticmethod
    def _key(request: Request) -> str:
        credential = request.headers.get("X-API-Key") or request.headers.get(
            "Authorization", ""
        )
        if credential:
            digest = hashlib.sha256(credential.encode()).hexdigest()[:32]
            return f"credential:{digest}"
        host = request.client.host if request.client else "unknown"
        return f"ip:{host}"

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)
        decision = await self.limiter.check(
            self._key(request), self.limit, self.window
        )
        headers = {
            "X-RateLimit-Limit": str(decision.limit),
            "X-RateLimit-Remaining": str(decision.remaining),
            "X-RateLimit-Reset": str(decision.reset_after_seconds),
        }
        if not decision.allowed:
            headers["Retry-After"] = str(decision.reset_after_seconds)
            return JSONResponse(
                status_code=429,
                headers=headers,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Rate limit exceeded",
                        "retryable": True,
                        "request_id": getattr(request.state, "request_id", None),
                        "details": {
                            "retry_after_seconds": decision.reset_after_seconds
                        },
                    }
                },
            )
        response = await call_next(request)
        response.headers.update(headers)
        return response
