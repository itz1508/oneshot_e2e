"""OneShot Python Configuration Loader.

Reads config.toml from the project root using Python 3.12 tomllib,
validates structure with Pydantic, and provides configuration to the Python reasoning service.
"""

import os
import tomllib
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class AppConfig(BaseModel):
    name: str = "OneShot Agent Runtime"
    version: str = "1.3.0"
    environment: str = "production"


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8787
    request_max_bytes: int = 10485760
    body_timeout_ms: int = 30000
    cors_allowed_origins: list[str] = Field(default_factory=lambda: ["*"])


class RateLimitingConfig(BaseModel):
    enabled: bool = True
    max_requests_per_minute: int = 120
    burst_limit: int = 30
    window_seconds: int = 60


class AuthConfig(BaseModel):
    enabled: bool = False
    # camelCase to match config.toml / the TS AuthGuardOptions consumers.
    apiKeyEnv: str = "ONESHOT_API_TOKEN"
    headerName: str = "authorization"


class SecurityHeadersConfig(BaseModel):
    enabled: bool = True
    # camelCase to match config.toml / the TS SecurityHeadersOptions consumers.
    contentSecurityPolicy: str = "default-src 'self';"
    xContentTypeOptions: str = "nosniff"
    xFrameOptions: str = "DENY"
    strictTransportSecurity: str = "max-age=31536000; includeSubDomains"


class SecurityConfig(BaseModel):
    rate_limiting: RateLimitingConfig = Field(default_factory=RateLimitingConfig)
    auth: AuthConfig = Field(default_factory=AuthConfig)
    headers: SecurityHeadersConfig = Field(default_factory=SecurityHeadersConfig)


class SandboxPartition(BaseModel):
    name: str
    path: str
    description: str | None = None


class SandboxConfig(BaseModel):
    virtual_mode: bool = True
    max_file_size_bytes: int = 52428800
    partitions: list[SandboxPartition] = Field(default_factory=list)


class ModelProvider(BaseModel):
    name: str
    priority: int = 50
    baseUrl: str
    defaultModel: str
    models: list[str] = Field(default_factory=list)
    envKey: str
    explicit: bool = False
    fallback: str | None = None


class ModelRoles(BaseModel):
    reasoning: str = "ministral-8b-latest"
    fast: str = "gemini-2.5-flash"
    coding: str = "ministral-8b-latest"
    critic: str = "ministral-8b-latest"
    vision: str = "gemini-2.5-flash"
    local: str = "llama3.2"


class ModelsConfig(BaseModel):
    default_provider: str = "mistral"
    fallback_provider: str = "gemini"
    roles: ModelRoles = Field(default_factory=ModelRoles)
    providers: list[ModelProvider] = Field(default_factory=list)


class OneShotConfig(BaseModel):
    app: AppConfig = Field(default_factory=AppConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    security: SecurityConfig = Field(default_factory=SecurityConfig)
    sandbox: SandboxConfig = Field(default_factory=SandboxConfig)
    models: ModelsConfig = Field(default_factory=ModelsConfig)


def find_config_toml() -> Path | None:
    """Search upwards for config.toml starting from current file."""
    candidates = [
        Path(os.environ.get("ONESHOT_CONFIG_PATH", "")),
        Path.cwd() / "config.toml",
        Path(__file__).resolve().parent.parent.parent.parent / "config.toml",
    ]
    for p in candidates:
        if p and p.is_file():
            return p
    return None


@lru_cache(maxsize=1)
def get_config() -> OneShotConfig:
    """Load, parse, and validate config.toml, or return safe defaults."""
    path = find_config_toml()
    if not path:
        return OneShotConfig()

    try:
        with open(path, "rb") as f:
            data: dict[str, Any] = tomllib.load(f)
        return OneShotConfig.model_validate(data)
    except Exception as exc:
        print(f"[OneShotConfig] Warning: could not load config.toml from {path}: {exc}")
        return OneShotConfig()
