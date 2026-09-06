"""Normalized provider clients for OpenAI-compatible, Ollama, Gemini, and Claude.

Each client accepts the same ``ModelRequest`` and returns the same
``ModelResult``. Provider-specific SDK objects never cross this module.

Example::

    result = await OpenAICompatibleClient(settings).complete(
        provider, model, decrypted_secret, ModelRequest(messages=[...])
    )
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from workspace_api.config import WorkspaceSettings
from workspace_api.errors import ProviderError
from workspace_api.models import MessageRole, ModelConfiguration, ModelProvider


@dataclass(frozen=True, slots=True)
class ProviderMessage:
    role: MessageRole
    content: str


@dataclass(frozen=True, slots=True)
class ModelRequest:
    messages: list[ProviderMessage]
    temperature: float | None = None
    max_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class ModelUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass(frozen=True, slots=True)
class ModelResult:
    content: str
    usage: ModelUsage = field(default_factory=ModelUsage)
    provider_request_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class ProviderClient(Protocol):
    """Provider-independent inference client contract."""

    async def complete(
        self,
        provider: ModelProvider,
        model: ModelConfiguration,
        credential: str | None,
        request: ModelRequest,
    ) -> ModelResult: ...


def _retryable(error: Exception) -> bool:
    status = getattr(error, "status_code", None)
    return status is None or int(status) == 429 or int(status) >= 500


def _provider_failure(provider: ModelProvider, error: Exception) -> ProviderError:
    return ProviderError(
        provider.slug,
        "The selected model provider request failed",
        retryable=_retryable(error),
        details={
            "error_type": type(error).__name__,
            **(
                {"status_code": int(error.status_code)}
                if getattr(error, "status_code", None) is not None
                else {}
            ),
        },
    )


class OpenAICompatibleClient:
    """Call Featherless, OpenAI, or Ollama through Chat Completions."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self.settings = settings

    async def complete(
        self,
        provider: ModelProvider,
        model: ModelConfiguration,
        credential: str | None,
        request: ModelRequest,
    ) -> ModelResult:
        from openai import AsyncOpenAI

        api_key = credential or (
            "ollama" if provider.kind.value == "ollama" else None
        )
        if not api_key:
            raise ProviderError(
                provider.slug,
                "The selected provider has no active credential",
                retryable=False,
            )
        if not provider.base_url:
            raise ProviderError(
                provider.slug,
                "The selected OpenAI-compatible provider has no base URL",
                retryable=False,
            )
        try:
            configured_headers = provider.config_json.get("headers", {})
            default_headers = {
                str(key): str(value)
                for key, value in configured_headers.items()
                if str(key).lower() not in {"authorization", "x-api-key"}
            }
            extra_body = {
                key: value
                for key, value in model.parameters_json.items()
                if key
                not in {
                    "model",
                    "messages",
                    "stream",
                    "temperature",
                    "max_tokens",
                }
            }
            async with AsyncOpenAI(
                api_key=api_key,
                base_url=provider.base_url,
                timeout=self.settings.provider_timeout_seconds,
                max_retries=self.settings.provider_max_retries,
                default_headers=default_headers,
            ) as client:
                completion = await client.chat.completions.create(
                    model=model.provider_model_id,
                    messages=[
                        {
                            "role": (
                                "user"
                                if message.role == MessageRole.TOOL
                                else message.role.value
                            ),
                            "content": message.content,
                        }
                        for message in request.messages
                    ],
                    **(
                        {"temperature": request.temperature}
                        if request.temperature is not None
                        else {}
                    ),
                    **(
                        {
                            "max_tokens": request.max_tokens
                            or model.max_output_tokens
                        }
                        if request.max_tokens or model.max_output_tokens
                        else {}
                    ),
                    **({"extra_body": extra_body} if extra_body else {}),
                )
            if not completion.choices:
                raise ValueError("provider returned no completion choice")
            content = completion.choices[0].message.content
            if not isinstance(content, str) or not content:
                raise ValueError("provider returned no text content")
            usage = completion.usage
            return ModelResult(
                content=content,
                provider_request_id=completion.id,
                usage=ModelUsage(
                    input_tokens=int(usage.prompt_tokens if usage else 0),
                    output_tokens=int(usage.completion_tokens if usage else 0),
                    cached_tokens=int(
                        getattr(
                            getattr(usage, "prompt_tokens_details", None),
                            "cached_tokens",
                            0,
                        )
                        or 0
                    ),
                ),
            )
        except ProviderError:
            raise
        except Exception as error:
            raise _provider_failure(provider, error) from error


class GeminiClient:
    """Call Gemini through the Google Gen AI SDK using API-key or ADC auth."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self.settings = settings

    async def complete(
        self,
        provider: ModelProvider,
        model: ModelConfiguration,
        credential: str | None,
        request: ModelRequest,
    ) -> ModelResult:
        from google import genai
        from google.genai import types

        auth_mode = str(provider.config_json.get("auth_mode", "api_key"))
        try:
            if auth_mode in {"adc", "vertex", "vertex_ai"}:
                project = provider.config_json.get("project")
                location = provider.config_json.get("location", "us-central1")
                client = genai.Client(
                    vertexai=True,
                    project=project,
                    location=location,
                    http_options=types.HttpOptions(api_version="v1"),
                )
            else:
                if not credential:
                    raise ProviderError(
                        provider.slug,
                        "The Gemini provider has no API key credential",
                        retryable=False,
                    )
                client = genai.Client(api_key=credential)

            system_instruction = "\n\n".join(
                message.content
                for message in request.messages
                if message.role == MessageRole.SYSTEM
            )
            contents = [
                types.Content(
                    role=(
                        "model"
                        if message.role == MessageRole.ASSISTANT
                        else "user"
                    ),
                    parts=[types.Part.from_text(text=message.content)],
                )
                for message in request.messages
                if message.role != MessageRole.SYSTEM
            ]
            async_client = client.aio
            try:
                response = await async_client.models.generate_content(
                    model=model.provider_model_id,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction or None,
                        temperature=request.temperature,
                        max_output_tokens=request.max_tokens
                        or model.max_output_tokens,
                    ),
                )
            finally:
                await async_client.aclose()
            if not response.text:
                raise ValueError("Gemini returned no text content")
            usage = response.usage_metadata
            return ModelResult(
                content=response.text,
                provider_request_id=getattr(response, "response_id", None),
                usage=ModelUsage(
                    input_tokens=int(
                        getattr(usage, "prompt_token_count", 0) or 0
                    ),
                    output_tokens=int(
                        getattr(usage, "candidates_token_count", 0) or 0
                    ),
                    cached_tokens=int(
                        getattr(usage, "cached_content_token_count", 0) or 0
                    ),
                ),
            )
        except ProviderError:
            raise
        except Exception as error:
            raise _provider_failure(provider, error) from error


class AnthropicClient:
    """Call Claude through Anthropic's asynchronous Messages SDK."""

    def __init__(self, settings: WorkspaceSettings) -> None:
        self.settings = settings

    async def complete(
        self,
        provider: ModelProvider,
        model: ModelConfiguration,
        credential: str | None,
        request: ModelRequest,
    ) -> ModelResult:
        from anthropic import AsyncAnthropic

        if not credential:
            raise ProviderError(
                provider.slug,
                "The Anthropic provider has no active credential",
                retryable=False,
            )
        system = "\n\n".join(
            message.content
            for message in request.messages
            if message.role == MessageRole.SYSTEM
        )
        messages = [
            {
                "role": (
                    "assistant"
                    if message.role == MessageRole.ASSISTANT
                    else "user"
                ),
                "content": message.content,
            }
            for message in request.messages
            if message.role != MessageRole.SYSTEM
        ]
        try:
            client_kwargs: dict[str, Any] = {
                "api_key": credential,
                "timeout": self.settings.provider_timeout_seconds,
                "max_retries": self.settings.provider_max_retries,
            }
            if provider.base_url:
                client_kwargs["base_url"] = provider.base_url
            async with AsyncAnthropic(**client_kwargs) as client:
                optional: dict[str, Any] = {}
                for name in (
                    "stop_sequences",
                    "service_tier",
                    "thinking",
                    "output_config",
                ):
                    if name in model.parameters_json:
                        optional[name] = model.parameters_json[name]
                response = await client.messages.create(
                    model=model.provider_model_id,
                    messages=messages,
                    max_tokens=request.max_tokens
                    or model.max_output_tokens
                    or 4096,
                    **({"system": system} if system else {}),
                    **optional,
                )
            content = "".join(
                block.text
                for block in response.content
                if getattr(block, "type", None) == "text"
            )
            if not content:
                raise ValueError("Anthropic returned no text content")
            return ModelResult(
                content=content,
                provider_request_id=response.id,
                usage=ModelUsage(
                    input_tokens=int(response.usage.input_tokens),
                    output_tokens=int(response.usage.output_tokens),
                ),
            )
        except ProviderError:
            raise
        except Exception as error:
            raise _provider_failure(provider, error) from error
