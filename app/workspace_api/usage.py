"""Immutable usage accounting, cost calculation, summaries, and quota checks.

Usage events are written once per provider attempt. Aggregates are calculated
from events, keeping billing and analytics auditable instead of relying on a
mutable counter as the source of truth.

Example::

    tracker.assert_quota(session, workspace_id)
    event = tracker.record_success(session, selection, result, elapsed_ms, ...)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from workspace_api.errors import QuotaExceededError
from workspace_api.models import (
    ModelConfiguration,
    ModelProvider,
    Subscription,
    SubscriptionStatus,
    UsageEvent,
    UsageStatus,
)
from workspace_api.providers import ModelResult


def _period_start(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def _period_end(now: datetime) -> datetime:
    start = _period_start(now)
    return (
        datetime(start.year + 1, 1, 1, tzinfo=timezone.utc)
        if start.month == 12
        else datetime(start.year, start.month + 1, 1, tzinfo=timezone.utc)
    )


class UsageTracker:
    """Record provider calls and enforce subscription request/token/cost quotas."""

    def summary(
        self,
        session: Session,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, int | Decimal | datetime | str]:
        """Aggregate immutable events over a half-open time interval."""

        row = session.execute(
            select(
                func.count(UsageEvent.id),
                func.sum(
                    case((UsageEvent.status == UsageStatus.SUCCESS, 1), else_=0)
                ),
                func.coalesce(func.sum(UsageEvent.input_tokens), 0),
                func.coalesce(func.sum(UsageEvent.output_tokens), 0),
                func.coalesce(func.sum(UsageEvent.total_tokens), 0),
                func.coalesce(func.sum(UsageEvent.cost_usd), 0),
            ).where(
                UsageEvent.workspace_id == workspace_id,
                UsageEvent.created_at >= start,
                UsageEvent.created_at < end,
            )
        ).one()
        return {
            "workspace_id": workspace_id,
            "period_start": start,
            "period_end": end,
            "requests": int(row[0] or 0),
            "successful_requests": int(row[1] or 0),
            "input_tokens": int(row[2] or 0),
            "output_tokens": int(row[3] or 0),
            "total_tokens": int(row[4] or 0),
            "cost_usd": Decimal(row[5] or 0),
        }

    def assert_quota(self, session: Session, workspace_id: str) -> None:
        """Reject calls for inactive subscriptions or exhausted hard quotas."""

        subscription = session.scalar(
            select(Subscription).where(Subscription.workspace_id == workspace_id)
        )
        if not subscription:
            raise QuotaExceededError("subscription", "missing")
        if subscription.status != SubscriptionStatus.ACTIVE:
            raise QuotaExceededError("subscription", subscription.status.value)

        now = datetime.now(timezone.utc)
        start = subscription.current_period_start or _period_start(now)
        end = subscription.current_period_end or _period_end(now)
        totals = self.summary(session, workspace_id, start, end)
        if int(totals["requests"]) >= subscription.monthly_request_limit:
            raise QuotaExceededError(
                "monthly_request", str(subscription.monthly_request_limit)
            )
        if int(totals["total_tokens"]) >= subscription.monthly_token_limit:
            raise QuotaExceededError(
                "monthly_token", str(subscription.monthly_token_limit)
            )
        if Decimal(totals["cost_usd"]) >= subscription.monthly_cost_limit_usd:
            raise QuotaExceededError(
                "monthly_cost_usd", str(subscription.monthly_cost_limit_usd)
            )

        minute_ago = now - timedelta(minutes=1)
        recent = session.scalar(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.workspace_id == workspace_id,
                UsageEvent.created_at >= minute_ago,
            )
        )
        if int(recent or 0) >= subscription.requests_per_minute:
            raise QuotaExceededError(
                "requests_per_minute", str(subscription.requests_per_minute)
            )

    @staticmethod
    def calculate_cost(
        model: ModelConfiguration, input_tokens: int, output_tokens: int
    ) -> Decimal:
        """Calculate model cost from per-million-token prices."""

        million = Decimal(1_000_000)
        return (
            Decimal(input_tokens) * model.input_cost_per_million_usd / million
            + Decimal(output_tokens) * model.output_cost_per_million_usd / million
        ).quantize(Decimal("0.00000001"))

    def record_success(
        self,
        session: Session,
        *,
        request_id: str,
        workspace_id: str,
        user_id: str | None,
        api_key_id: str | None,
        conversation_id: str | None,
        model: ModelConfiguration,
        provider: ModelProvider,
        result: ModelResult,
        latency_ms: int,
    ) -> UsageEvent:
        """Append a successful provider-call usage event."""

        event = UsageEvent(
            request_id=request_id,
            workspace_id=workspace_id,
            user_id=user_id,
            api_key_id=api_key_id,
            conversation_id=conversation_id,
            model_config_id=model.id,
            provider_id=provider.id,
            status=UsageStatus.SUCCESS,
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
            cached_tokens=result.usage.cached_tokens,
            total_tokens=result.usage.total_tokens,
            cost_usd=self.calculate_cost(
                model, result.usage.input_tokens, result.usage.output_tokens
            ),
            latency_ms=latency_ms,
            provider_request_id=result.provider_request_id,
            metadata_json=result.metadata,
        )
        session.add(event)
        session.flush()
        return event

    def record_error(
        self,
        session: Session,
        *,
        request_id: str,
        workspace_id: str,
        user_id: str | None,
        api_key_id: str | None,
        conversation_id: str | None,
        model: ModelConfiguration | None,
        provider: ModelProvider | None,
        latency_ms: int,
        error_code: str,
        error_message: str,
    ) -> UsageEvent:
        """Append a sanitized failed provider-call event."""

        event = UsageEvent(
            request_id=request_id,
            workspace_id=workspace_id,
            user_id=user_id,
            api_key_id=api_key_id,
            conversation_id=conversation_id,
            model_config_id=model.id if model else None,
            provider_id=provider.id if provider else None,
            status=UsageStatus.ERROR,
            latency_ms=latency_ms,
            error_code=error_code[:120],
            error_message=error_message[:2000],
        )
        session.add(event)
        session.flush()
        return event
