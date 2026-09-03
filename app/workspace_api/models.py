"""Relational data model for the OneShot AI Workspace control plane.

The schema is PostgreSQL-compatible while remaining executable on SQLite for
local development. Secrets are never stored in plaintext: provider credentials
contain encrypted ciphertext and workspace API keys contain keyed hashes.

Example::

    user = User(email="owner@example.com", password_hash="...")
    workspace = Workspace(name="Demo", slug="demo", owner_user_id=user.id)
    session.add_all([user, workspace])
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from workspace_api.database import Base


def utcnow() -> datetime:
    """Return an aware UTC timestamp."""

    return datetime.now(timezone.utc)


def new_id() -> str:
    """Return a portable UUID string identifier."""

    return str(uuid.uuid4())


def enum_type(enum_class: type[enum.Enum], name: str) -> SAEnum:
    """Create a portable enum storing public enum values, not Python names."""

    return SAEnum(
        enum_class,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    PENDING = "pending"


class WorkspaceRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class ProviderKind(str, enum.Enum):
    OPENAI_COMPATIBLE = "openai_compatible"
    OLLAMA = "ollama"
    GEMINI = "gemini"
    ANTHROPIC = "anthropic"
    CUSTOM = "custom"


class AvailabilityStatus(str, enum.Enum):
    UNKNOWN = "unknown"
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class CredentialStatus(str, enum.Enum):
    ACTIVE = "active"
    RETIRED = "retired"
    REVOKED = "revoked"


class ConversationStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class MessageRole(str, enum.Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class UsageStatus(str, enum.Enum):
    SUCCESS = "success"
    ERROR = "error"
    CANCELLED = "cancelled"


class TimestampMixin:
    """Created/updated timestamps shared by mutable entities."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(TimestampMixin, Base):
    """Human account authenticated with a password-derived Argon2 hash."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[UserStatus] = mapped_column(
        enum_type(UserStatus, "user_status"), default=UserStatus.ACTIVE
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    memberships: Mapped[list["WorkspaceMembership"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="WorkspaceMembership.user_id",
    )


class Workspace(TimestampMixin, Base):
    """Tenant boundary for members, models, credentials, chats, and usage."""

    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    memberships: Mapped[list["WorkspaceMembership"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    subscription: Mapped["Subscription | None"] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", uselist=False
    )


class WorkspaceMembership(TimestampMixin, Base):
    """Association object carrying a user's role within a workspace."""

    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        enum_type(WorkspaceRole, "workspace_role"), default=WorkspaceRole.MEMBER
    )
    invited_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(
        back_populates="memberships", foreign_keys=[user_id]
    )


class Subscription(TimestampMixin, Base):
    """Workspace plan and hard quota configuration."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), unique=True
    )
    plan_code: Mapped[str] = mapped_column(String(64), default="developer")
    status: Mapped[SubscriptionStatus] = mapped_column(
        enum_type(SubscriptionStatus, "subscription_status"),
        default=SubscriptionStatus.ACTIVE,
    )
    requests_per_minute: Mapped[int] = mapped_column(Integer, default=60)
    monthly_request_limit: Mapped[int] = mapped_column(Integer, default=10_000)
    monthly_token_limit: Mapped[int] = mapped_column(Integer, default=5_000_000)
    monthly_cost_limit_usd: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), default=Decimal("100.00")
    )
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped[Workspace] = relationship(back_populates="subscription")


class ModelProvider(TimestampMixin, Base):
    """Provider endpoint definition shared by workspace model configurations."""

    __tablename__ = "model_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[ProviderKind] = mapped_column(
        enum_type(ProviderKind, "provider_kind")
    )
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ProviderCredential(TimestampMixin, Base):
    """Versioned encrypted provider secret owned by one workspace."""

    __tablename__ = "provider_credentials"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "provider_id", "name", "version",
            name="uq_provider_credential_version",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    provider_id: Mapped[str] = mapped_column(
        ForeignKey("model_providers.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    encrypted_secret: Mapped[str] = mapped_column(Text)
    secret_prefix: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[CredentialStatus] = mapped_column(
        enum_type(CredentialStatus, "credential_status"),
        default=CredentialStatus.ACTIVE,
    )
    rotated_from_id: Mapped[str | None] = mapped_column(
        ForeignKey("provider_credentials.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class WorkspaceApiKey(TimestampMixin, Base):
    """Workspace bearer key stored only as an HMAC digest."""

    __tablename__ = "workspace_api_keys"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "name", "version", name="uq_workspace_api_key_version"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(String(100))
    key_prefix: Mapped[str] = mapped_column(String(20), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[CredentialStatus] = mapped_column(
        enum_type(CredentialStatus, "workspace_api_key_status"),
        default=CredentialStatus.ACTIVE,
    )
    scopes_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    rotated_from_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspace_api_keys.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ModelConfiguration(TimestampMixin, Base):
    """Workspace-visible model alias, routing weight, limits, and pricing."""

    __tablename__ = "model_configurations"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "public_name",
            "provider_id",
            "provider_model_id",
            name="uq_workspace_model_route",
        ),
        Index("ix_model_route", "workspace_id", "enabled", "priority"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    provider_id: Mapped[str] = mapped_column(
        ForeignKey("model_providers.id", ondelete="RESTRICT"), index=True
    )
    credential_id: Mapped[str | None] = mapped_column(
        ForeignKey("provider_credentials.id", ondelete="SET NULL"), nullable=True
    )
    public_name: Mapped[str] = mapped_column(String(120))
    provider_model_id: Mapped[str] = mapped_column(String(200))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    max_context_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_cost_per_million_usd: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), default=Decimal("0")
    )
    output_cost_per_million_usd: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), default=Decimal("0")
    )
    availability: Mapped[AvailabilityStatus] = mapped_column(
        enum_type(AvailabilityStatus, "model_availability"),
        default=AvailabilityStatus.UNKNOWN,
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    parameters_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    provider: Mapped[ModelProvider] = relationship()
    credential: Mapped[ProviderCredential | None] = relationship()


class ModelHealthSnapshot(Base):
    """Append-only model availability observation."""

    __tablename__ = "model_health_snapshots"
    __table_args__ = (Index("ix_model_health_time", "model_config_id", "checked_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    model_config_id: Mapped[str] = mapped_column(
        ForeignKey("model_configurations.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[AvailabilityStatus] = mapped_column(
        enum_type(AvailabilityStatus, "health_availability")
    )
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Conversation(TimestampMixin, Base):
    """Ordered chat container scoped to a workspace and creator."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    status: Mapped[ConversationStatus] = mapped_column(
        enum_type(ConversationStatus, "conversation_status"),
        default=ConversationStatus.ACTIVE,
    )
    active_model_config_id: Mapped[str | None] = mapped_column(
        ForeignKey("model_configurations.id", ondelete="SET NULL"), nullable=True
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.sequence",
    )


class ChatMessage(Base):
    """Immutable ordered message with optional provider and usage linkage."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "sequence", name="uq_message_sequence"),
        Index("ix_message_conversation_time", "conversation_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    role: Mapped[MessageRole] = mapped_column(enum_type(MessageRole, "message_role"))
    content: Mapped[str] = mapped_column(Text)
    model_config_id: Mapped[str | None] = mapped_column(
        ForeignKey("model_configurations.id", ondelete="SET NULL"), nullable=True
    )
    provider_message_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class ContextItem(TimestampMixin, Base):
    """Pinned or summarized context independently addressable from messages."""

    __tablename__ = "context_items"
    __table_args__ = (
        Index("ix_context_workspace_conversation", "workspace_id", "conversation_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(50))
    source: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class UsageEvent(Base):
    """Append-only provider-call accounting and error observation."""

    __tablename__ = "usage_events"
    __table_args__ = (
        Index("ix_usage_workspace_time", "workspace_id", "created_at"),
        Index("ix_usage_model_time", "model_config_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspace_api_keys.id", ondelete="SET NULL"), nullable=True
    )
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    model_config_id: Mapped[str | None] = mapped_column(
        ForeignKey("model_configurations.id", ondelete="SET NULL"), nullable=True
    )
    provider_id: Mapped[str | None] = mapped_column(
        ForeignKey("model_providers.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[UsageStatus] = mapped_column(enum_type(UsageStatus, "usage_status"))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(18, 8), default=Decimal("0")
    )
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_request_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class AuditLog(Base):
    """Append-only security and administrative activity record."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_workspace_time", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True
    )
    actor_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspace_api_keys.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
