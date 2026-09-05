"""Database-driven model routing, weighted balancing, and provider failover.

Routes are selected within the lowest numeric priority tier. Smooth weighted
round-robin distributes requests among equivalent routes; retryable provider
errors degrade that route and continue to the next configured candidate.

Example::

    route = await router.complete(
        session, workspace_id, ModelRequest(messages=[...]), requested_model="fast"
    )
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from workspace_api.config import WorkspaceSettings
from workspace_api.errors import NotFoundError, ProviderError
from workspace_api.models import (
    AvailabilityStatus,
    CredentialStatus,
    ModelConfiguration,
    ModelHealthSnapshot,
    ModelProvider,
    ProviderKind,
)
from workspace_api.providers import (
    AnthropicClient,
    GeminiClient,
    ModelRequest,
    ModelResult,
    OpenAICompatibleClient,
    ProviderClient,
)
from workspace_api.security import SecretCipher


@dataclass(frozen=True, slots=True)
class RouteResult:
    """Normalized inference result plus the selected accounting entities."""

    model: ModelConfiguration
    provider: ModelProvider
    result: ModelResult


class ModelRouter:
    """Select model routes, decrypt credentials, balance, and fail over."""

    def __init__(
        self,
        settings: WorkspaceSettings,
        cipher: SecretCipher,
        clients: dict[ProviderKind, ProviderClient] | None = None,
    ) -> None:
        openai = OpenAICompatibleClient(settings)
        self.clients: dict[ProviderKind, ProviderClient] = clients or {
            ProviderKind.OPENAI_COMPATIBLE: openai,
            ProviderKind.OLLAMA: openai,
            ProviderKind.GEMINI: GeminiClient(settings),
            ProviderKind.ANTHROPIC: AnthropicClient(settings),
        }
        self.cipher = cipher
        self._weights: dict[tuple[str, str], dict[str, int]] = {}
        self._lock = asyncio.Lock()

    def register_client(self, kind: ProviderKind, client: ProviderClient) -> None:
        """Register or replace a provider client, primarily for custom adapters."""

        self.clients[kind] = client

    def _candidates(
        self, session: Session, workspace_id: str, requested_model: str | None
    ) -> list[ModelConfiguration]:
        statement = (
            select(ModelConfiguration)
            .join(ModelConfiguration.provider)
            .options(
                joinedload(ModelConfiguration.provider),
                joinedload(ModelConfiguration.credential),
            )
            .where(
                ModelConfiguration.workspace_id == workspace_id,
                ModelConfiguration.enabled.is_(True),
                ModelProvider.enabled.is_(True),
                ModelConfiguration.availability
                != AvailabilityStatus.UNAVAILABLE,
            )
        )
        if requested_model:
            statement = statement.where(
                or_(
                    ModelConfiguration.public_name == requested_model,
                    ModelConfiguration.provider_model_id == requested_model,
                )
            )
        candidates = list(session.scalars(statement).all())
        if not requested_model:
            default_aliases = {
                candidate.public_name
                for candidate in candidates
                if candidate.is_default
            }
            if default_aliases:
                candidates = [
                    candidate
                    for candidate in candidates
                    if candidate.public_name in default_aliases
                ]
        if not candidates:
            raise NotFoundError("available model route", requested_model or "default")
        return candidates

    async def _weighted_order(
        self,
        workspace_id: str,
        alias: str,
        candidates: list[ModelConfiguration],
    ) -> list[ModelConfiguration]:
        """Return candidates with smooth weighted round-robin choice first."""

        ordered: list[ModelConfiguration] = []
        for priority in sorted({candidate.priority for candidate in candidates}):
            tier = [
                candidate
                for candidate in candidates
                if candidate.priority == priority
            ]
            key = (workspace_id, f"{alias}:{priority}")
            async with self._lock:
                current = self._weights.setdefault(key, {})
                active_ids = {candidate.id for candidate in tier}
                for stale in set(current) - active_ids:
                    current.pop(stale, None)
                total = 0
                for candidate in tier:
                    total += candidate.weight
                    current[candidate.id] = (
                        current.get(candidate.id, 0) + candidate.weight
                    )
                selected = max(tier, key=lambda candidate: current[candidate.id])
                current[selected.id] -= total
            remainder = sorted(
                (candidate for candidate in tier if candidate.id != selected.id),
                key=lambda candidate: (-candidate.weight, candidate.id),
            )
            ordered.extend([selected, *remainder])
        return ordered

    def _credential(self, model: ModelConfiguration) -> str | None:
        credential = model.credential
        if not credential:
            return None
        now = datetime.now(timezone.utc)
        expires_at = credential.expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if credential.status != CredentialStatus.ACTIVE or (
            expires_at and expires_at <= now
        ):
            raise ProviderError(
                model.provider.slug,
                "The selected model credential is inactive or expired",
                retryable=False,
            )
        credential.last_used_at = now
        return self.cipher.decrypt(credential.encrypted_secret)

    @staticmethod
    def _health(
        session: Session,
        model: ModelConfiguration,
        status: AvailabilityStatus,
        *,
        latency_ms: int | None = None,
        error_code: str | None = None,
    ) -> None:
        model.availability = status
        model.last_checked_at = datetime.now(timezone.utc)
        session.add(
            ModelHealthSnapshot(
                model_config_id=model.id,
                status=status,
                latency_ms=latency_ms,
                error_code=error_code,
            )
        )

    async def complete(
        self,
        session: Session,
        workspace_id: str,
        request: ModelRequest,
        requested_model: str | None = None,
    ) -> RouteResult:
        """Route one request and fail over only on retryable provider failures."""

        candidates = self._candidates(session, workspace_id, requested_model)
        ordered = await self._weighted_order(
            workspace_id,
            requested_model or candidates[0].public_name,
            candidates,
        )
        last_error: ProviderError | None = None
        for model in ordered:
            provider = model.provider
            client = self.clients.get(provider.kind)
            if not client:
                last_error = ProviderError(
                    provider.slug,
                    f"No provider client is registered for {provider.kind.value}",
                    retryable=False,
                )
                self._health(
                    session,
                    model,
                    AvailabilityStatus.UNAVAILABLE,
                    error_code="CLIENT_NOT_REGISTERED",
                )
                continue
            try:
                credential = self._credential(model)
                result = await client.complete(
                    provider, model, credential, request
                )
                self._health(session, model, AvailabilityStatus.AVAILABLE)
                session.flush()
                return RouteResult(model=model, provider=provider, result=result)
            except ProviderError as error:
                last_error = error
                self._health(
                    session,
                    model,
                    AvailabilityStatus.DEGRADED
                    if error.retryable
                    else AvailabilityStatus.UNAVAILABLE,
                    error_code=error.code,
                )
            except Exception as error:
                last_error = ProviderError(
                    provider.slug,
                    "The provider client failed outside its normalized contract",
                    retryable=True,
                    details={"error_type": type(error).__name__},
                )
                self._health(
                    session,
                    model,
                    AvailabilityStatus.DEGRADED,
                    error_code="UNNORMALIZED_PROVIDER_ERROR",
                )
        if last_error:
            raise last_error
        raise ProviderError("router", "No model route could complete the request")
