"""Authentication resolution for user JWTs and workspace API keys.

Human requests use ``Authorization: Bearer <JWT>``. Automation may use either
``X-API-Key: osk_...`` or the same key in the Bearer header.

Example::

    principal = authenticator.authenticate(request, session)
    principal.require_scope("chat:write")
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from workspace_api.errors import AuthenticationError, AuthorizationError
from workspace_api.models import (
    CredentialStatus,
    User,
    UserStatus,
    WorkspaceApiKey,
)
from workspace_api.security import ApiKeyService, TokenService


@dataclass(frozen=True, slots=True)
class Principal:
    """Authenticated human or workspace automation identity."""

    user_id: str | None = None
    workspace_id: str | None = None
    api_key_id: str | None = None
    scopes: frozenset[str] = frozenset()

    @property
    def is_user(self) -> bool:
        return self.user_id is not None

    def require_scope(self, scope: str) -> None:
        """Require an API-key scope; human authorization is role-based later."""

        if self.api_key_id and scope not in self.scopes and "*" not in self.scopes:
            raise AuthorizationError(f"Workspace API key lacks {scope} scope")


class Authenticator:
    """Resolve request credentials against signed tokens or hashed API keys."""

    def __init__(self, tokens: TokenService, api_keys: ApiKeyService) -> None:
        self.tokens = tokens
        self.api_keys = api_keys

    @staticmethod
    def _presented(request: Request) -> str:
        direct = request.headers.get("X-API-Key")
        authorization = request.headers.get("Authorization", "")
        bearer = (
            authorization[7:].strip()
            if authorization.lower().startswith("bearer ")
            else ""
        )
        if direct and bearer and direct != bearer:
            raise AuthenticationError("Multiple conflicting credentials supplied")
        token = direct or bearer
        if not token:
            raise AuthenticationError()
        return token

    def authenticate(self, request: Request, session: Session) -> Principal:
        """Return a validated principal and update API-key last-use metadata."""

        token = self._presented(request)
        if token.startswith("osk_"):
            prefix = token[:16]
            candidates = session.scalars(
                select(WorkspaceApiKey).where(
                    WorkspaceApiKey.key_prefix == prefix,
                    WorkspaceApiKey.status == CredentialStatus.ACTIVE,
                )
            ).all()
            record = next(
                (
                    candidate
                    for candidate in candidates
                    if self.api_keys.verify(token, candidate.key_hash)
                ),
                None,
            )
            if not record:
                raise AuthenticationError("Invalid workspace API key")
            now = datetime.now(timezone.utc)
            expires_at = record.expires_at
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at <= now:
                raise AuthenticationError("Workspace API key has expired")
            record.last_used_at = now
            session.flush()
            return Principal(
                workspace_id=record.workspace_id,
                api_key_id=record.id,
                scopes=frozenset(record.scopes_json),
            )

        claims = self.tokens.decode_access_token(token)
        user = session.get(User, claims.user_id)
        if not user or user.status != UserStatus.ACTIVE:
            raise AuthenticationError("User account is unavailable")
        return Principal(user_id=user.id)
