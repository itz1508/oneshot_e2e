"""Typed configuration for the OneShot Workspace API.

Configuration is read from ``ONESHOT_WORKSPACE_*`` environment variables and
optionally ``.env.workspace``. Production refuses placeholder security values.

Example::

    $env:ONESHOT_WORKSPACE_ENVIRONMENT = "development"
    $env:ONESHOT_WORKSPACE_DATABASE_URL = "sqlite:///./data/workspace.db"
    uvicorn --app-dir app workspace_api.main:app --reload
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkspaceSettings(BaseSettings):
    """Runtime configuration with fail-closed production secret validation."""

    model_config = SettingsConfigDict(
        env_prefix="ONESHOT_WORKSPACE_",
        env_file=".env.workspace",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "OneShot AI Workspace API"
    api_prefix: str = "/v1"
    database_url: str = "sqlite:///./data/oneshot-workspace.db"
    database_echo: bool = False
    auto_create_schema: bool = True

    jwt_secret: SecretStr = SecretStr(
        "development-only-jwt-secret-change-me-now"
    )
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    access_token_ttl_minutes: int = Field(default=30, ge=5, le=1440)
    api_key_pepper: SecretStr = SecretStr(
        "development-only-api-key-pepper-change-me-now"
    )
    encryption_keys: SecretStr = SecretStr("")

    cors_origins: str = "http://localhost:8787,http://localhost:3000"
    context_message_limit: int = Field(default=40, ge=1, le=500)
    provider_timeout_seconds: float = Field(default=120.0, ge=1.0, le=900.0)
    provider_max_retries: int = Field(default=2, ge=0, le=10)

    rate_limit_backend: Literal["memory", "redis"] = "memory"
    rate_limit_requests: int = Field(default=120, ge=1)
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=86400)
    redis_url: SecretStr = SecretStr("redis://localhost:6379/1")
    rate_limit_fail_open: bool = False

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "WorkspaceSettings":
        """Reject development secrets and missing encryption keys in production."""

        if self.environment != "production":
            return self
        problems: list[str] = []
        if self.jwt_secret.get_secret_value().startswith("development-only"):
            problems.append("ONESHOT_WORKSPACE_JWT_SECRET")
        if self.api_key_pepper.get_secret_value().startswith("development-only"):
            problems.append("ONESHOT_WORKSPACE_API_KEY_PEPPER")
        if not self.encryption_keys.get_secret_value().strip():
            problems.append("ONESHOT_WORKSPACE_ENCRYPTION_KEYS")
        if problems:
            raise ValueError(
                "production security configuration is missing: "
                + ", ".join(problems)
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        """Return normalized configured CORS origins."""

        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def fernet_keys(self) -> list[str]:
        """Return configured Fernet keys, deriving a test-only key when permitted."""

        configured = [
            value.strip()
            for value in self.encryption_keys.get_secret_value().split(",")
            if value.strip()
        ]
        if configured:
            return configured
        digest = hashlib.sha256(self.jwt_secret.get_secret_value().encode()).digest()
        return [base64.urlsafe_b64encode(digest).decode()]


@lru_cache(maxsize=1)
def get_settings() -> WorkspaceSettings:
    """Load and cache process configuration."""

    return WorkspaceSettings()
