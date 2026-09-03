"""Pydantic request and response contracts for the workspace HTTP API.

These models are the OpenAPI authority for the Python sidecar. ORM objects are
converted with ``from_attributes=True`` and secret-bearing responses expose
only prefixes except for one-time API-key creation responses.

Example::

    request = ChatCompletionRequest(
        messages=[ChatInputMessage(role="user", content="Audit this project")]
    )
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr

from workspace_api.models import (
    AvailabilityStatus,
    ConversationStatus,
    CredentialStatus,
    MessageRole,
    ProviderKind,
    SubscriptionStatus,
    UsageStatus,
    UserStatus,
    WorkspaceRole,
)


class OrmSchema(BaseModel):
    """Base response schema supporting SQLAlchemy attribute loading."""

    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=12, max_length=1024)
    display_name: str = Field(min_length=1, max_length=120)
    workspace_name: str = Field(min_length=1, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=1024)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RegisterResponse(BaseModel):
    user: "UserRead"
    workspace: "WorkspaceRead"
    token: TokenResponse


class UserRead(OrmSchema):
    id: str
    email: EmailStr
    display_name: str
    status: UserStatus
    created_at: datetime
    last_login_at: datetime | None


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, min_length=2, max_length=100)


class WorkspaceRead(OrmSchema):
    id: str
    name: str
    slug: str
    owner_user_id: str
    is_active: bool
    settings_json: dict[str, Any]
    created_at: datetime


class MembershipRead(OrmSchema):
    id: str
    workspace_id: str
    user_id: str
    role: WorkspaceRole
    created_at: datetime


class MembershipCreate(BaseModel):
    user_email: EmailStr
    role: WorkspaceRole = WorkspaceRole.MEMBER


class SubscriptionRead(OrmSchema):
    workspace_id: str
    plan_code: str
    status: SubscriptionStatus
    requests_per_minute: int
    monthly_request_limit: int
    monthly_token_limit: int
    monthly_cost_limit_usd: Decimal
    current_period_start: datetime
    current_period_end: datetime | None


class ProviderCreate(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,79}$")
    display_name: str = Field(min_length=1, max_length=120)
    kind: ProviderKind
    base_url: str | None = Field(default=None, max_length=500)
    config_json: dict[str, Any] = Field(default_factory=dict)


class ProviderRead(OrmSchema):
    id: str
    slug: str
    display_name: str
    kind: ProviderKind
    base_url: str | None
    enabled: bool
    config_json: dict[str, Any]


class ProviderCredentialCreate(BaseModel):
    provider_id: str
    name: str = Field(min_length=1, max_length=100)
    secret: SecretStr = Field(min_length=1, max_length=8192)
    expires_at: datetime | None = None


class ProviderCredentialRotate(BaseModel):
    secret: SecretStr = Field(min_length=1, max_length=8192)
    expires_at: datetime | None = None


class ProviderCredentialRead(OrmSchema):
    id: str
    workspace_id: str
    provider_id: str
    name: str
    secret_prefix: str
    version: int
    status: CredentialStatus
    rotated_from_id: str | None
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class WorkspaceApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=lambda: ["chat:write", "usage:read"])
    expires_at: datetime | None = None


class WorkspaceApiKeyRead(OrmSchema):
    id: str
    workspace_id: str
    name: str
    key_prefix: str
    version: int
    status: CredentialStatus
    scopes_json: list[str]
    rotated_from_id: str | None
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class WorkspaceApiKeyIssued(WorkspaceApiKeyRead):
    """One-time response containing the new raw workspace API key."""

    secret: str


class ModelConfigurationCreate(BaseModel):
    provider_id: str
    credential_id: str | None = None
    public_name: str = Field(min_length=1, max_length=120)
    provider_model_id: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    is_default: bool = False
    priority: int = Field(default=100, ge=0, le=10_000)
    weight: int = Field(default=1, ge=1, le=10_000)
    max_context_tokens: int | None = Field(default=None, ge=1)
    max_output_tokens: int | None = Field(default=None, ge=1)
    input_cost_per_million_usd: Decimal = Field(default=Decimal("0"), ge=0)
    output_cost_per_million_usd: Decimal = Field(default=Decimal("0"), ge=0)
    parameters_json: dict[str, Any] = Field(default_factory=dict)


class ModelConfigurationRead(OrmSchema):
    id: str
    workspace_id: str
    provider_id: str
    credential_id: str | None
    public_name: str
    provider_model_id: str
    enabled: bool
    is_default: bool
    priority: int
    weight: int
    max_context_tokens: int | None
    max_output_tokens: int | None
    input_cost_per_million_usd: Decimal
    output_cost_per_million_usd: Decimal
    availability: AvailabilityStatus
    last_checked_at: datetime | None
    parameters_json: dict[str, Any]
    created_at: datetime


class AvailabilityUpdate(BaseModel):
    status: AvailabilityStatus
    latency_ms: int | None = Field(default=None, ge=0)
    error_code: str | None = Field(default=None, max_length=120)


class ConversationCreate(BaseModel):
    title: str = Field(default="New conversation", min_length=1, max_length=200)
    active_model_config_id: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ConversationRead(OrmSchema):
    id: str
    workspace_id: str
    created_by_user_id: str | None
    title: str
    status: ConversationStatus
    active_model_config_id: str | None
    summary: str | None
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ChatInputMessage(BaseModel):
    role: MessageRole
    content: str = Field(min_length=1, max_length=1_000_000)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ChatMessageRead(OrmSchema):
    id: str
    conversation_id: str
    sequence: int
    role: MessageRole
    content: str
    model_config_id: str | None
    provider_message_id: str | None
    token_count: int | None
    metadata_json: dict[str, Any]
    created_at: datetime


class ContextItemCreate(BaseModel):
    conversation_id: str | None = None
    kind: str = Field(min_length=1, max_length=50)
    source: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=2_000_000)
    token_count: int | None = Field(default=None, ge=0)
    pinned: bool = False
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ContextItemRead(OrmSchema):
    id: str
    workspace_id: str
    conversation_id: str | None
    kind: str
    source: str
    content: str
    token_count: int | None
    pinned: bool
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ChatCompletionRequest(BaseModel):
    conversation_id: str | None = None
    messages: list[ChatInputMessage] = Field(min_length=1, max_length=100)
    model: str | None = Field(default=None, max_length=200)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=1_000_000)


class UsageRead(BaseModel):
    request_id: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_usd: Decimal
    latency_ms: int | None


class ChatCompletionResponse(BaseModel):
    conversation: ConversationRead
    message: ChatMessageRead
    model: ModelConfigurationRead
    usage: UsageRead


class UsageSummary(BaseModel):
    workspace_id: str
    period_start: datetime
    period_end: datetime
    requests: int
    successful_requests: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_usd: Decimal


class UsageEventRead(OrmSchema):
    id: str
    request_id: str
    workspace_id: str
    user_id: str | None
    api_key_id: str | None
    conversation_id: str | None
    model_config_id: str | None
    provider_id: str | None
    status: UsageStatus
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    total_tokens: int
    cost_usd: Decimal
    latency_ms: int | None
    provider_request_id: str | None
    error_code: str | None
    created_at: datetime


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool = False
    request_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorBody
