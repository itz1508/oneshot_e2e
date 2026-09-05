"""FastAPI application factory and REST endpoints for OneShot AI Workspace.

The generated OpenAPI contract covers authentication, tenants, provider keys,
model routes, chat history, completions, and usage analytics.

Example::

    app = create_app()
    # uvicorn --app-dir app workspace_api.main:app --host 0.0.0.0 --port 8080
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, Query, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from workspace_api.auth import Authenticator, Principal
from workspace_api.chat import ChatService
from workspace_api.config import WorkspaceSettings, get_settings
from workspace_api.database import Database
from workspace_api.errors import ConflictError, NotFoundError, register_error_handlers
from workspace_api.models import (
    AuditLog,
    AvailabilityStatus,
    ChatMessage,
    ContextItem,
    Conversation,
    ConversationStatus,
    CredentialStatus,
    ModelConfiguration,
    ModelHealthSnapshot,
    ModelProvider,
    ProviderCredential,
    ProviderKind,
    Subscription,
    UsageEvent,
    User,
    Workspace,
    WorkspaceApiKey,
    WorkspaceMembership,
    WorkspaceRole,
)
from workspace_api.observability import RequestContextMiddleware, configure_logging
from workspace_api.rate_limit import (
    MemoryRateLimiter,
    RateLimitMiddleware,
    RedisRateLimiter,
)
from workspace_api.router import ModelRouter
from workspace_api.schemas import (
    AvailabilityUpdate,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessageRead,
    ConversationCreate,
    ConversationRead,
    ContextItemCreate,
    ContextItemRead,
    ErrorResponse,
    LoginRequest,
    MembershipCreate,
    MembershipRead,
    ModelConfigurationCreate,
    ModelConfigurationRead,
    ProviderCredentialCreate,
    ProviderCredentialRead,
    ProviderCredentialRotate,
    ProviderRead,
    RegisterRequest,
    RegisterResponse,
    SubscriptionRead,
    TokenResponse,
    UsageRead,
    UsageEventRead,
    UsageSummary,
    UserRead,
    WorkspaceApiKeyCreate,
    WorkspaceApiKeyIssued,
    WorkspaceApiKeyRead,
    WorkspaceCreate,
    WorkspaceRead,
)
from workspace_api.security import (
    ApiKeyService,
    PasswordService,
    SecretCipher,
    TokenService,
)
from workspace_api.services import AuthService, CredentialService, WorkspaceService
from workspace_api.usage import UsageTracker, _period_end, _period_start


def _seed_providers(session: Session) -> None:
    """Create provider endpoint definitions without credentials or secret data."""

    seeds = [
        (
            "ollama-local",
            "Local Ollama",
            ProviderKind.OLLAMA,
            "http://localhost:11434/v1",
            {},
        ),
        (
            "featherless",
            "Featherless",
            ProviderKind.OPENAI_COMPATIBLE,
            "https://api.featherless.ai/v1",
            {"headers": {"X-Title": "OneShot"}},
        ),
        (
            "gemini-vertex",
            "Gemini on Vertex AI",
            ProviderKind.GEMINI,
            None,
            {"auth_mode": "adc", "location": "us-central1"},
        ),
        (
            "gemini-api",
            "Gemini Developer API",
            ProviderKind.GEMINI,
            None,
            {"auth_mode": "api_key"},
        ),
        (
            "anthropic",
            "Anthropic",
            ProviderKind.ANTHROPIC,
            None,
            {},
        ),
    ]
    existing = set(session.scalars(select(ModelProvider.slug)).all())
    for slug, name, kind, base_url, config in seeds:
        if slug not in existing:
            session.add(
                ModelProvider(
                    slug=slug,
                    display_name=name,
                    kind=kind,
                    base_url=base_url,
                    config_json=config,
                )
            )


def create_app(
    settings: WorkspaceSettings | None = None,
    *,
    database: Database | None = None,
    model_router: ModelRouter | None = None,
) -> FastAPI:
    """Build a fully configured application with injectable test boundaries."""

    settings = settings or get_settings()
    configure_logging(settings)
    database = database or Database(settings)
    passwords = PasswordService()
    tokens = TokenService(settings)
    api_keys = ApiKeyService(settings)
    cipher = SecretCipher(settings)
    authenticator = Authenticator(tokens, api_keys)
    workspace_service = WorkspaceService()
    auth_service = AuthService(passwords)
    credential_service = CredentialService(cipher, api_keys)
    usage = UsageTracker()
    model_router = model_router or ModelRouter(settings, cipher)
    chat_service = ChatService(settings, model_router, usage)
    limiter = (
        RedisRateLimiter(
            settings.redis_url.get_secret_value(),
            fail_open=settings.rate_limit_fail_open,
        )
        if settings.rate_limit_backend == "redis"
        else MemoryRateLimiter()
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if settings.auto_create_schema:
            database.create_schema()
        with database.session() as session:
            _seed_providers(session)
        yield
        await limiter.close()
        database.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        openapi_url="/openapi.json",
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            403: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            429: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
            502: {"model": ErrorResponse},
        },
    )
    app.state.settings = settings
    app.state.database = database
    app.state.model_router = model_router

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
        expose_headers=[
            "X-Request-ID",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
        ],
    )
    app.add_middleware(
        RateLimitMiddleware,
        limiter=limiter,
        limit=settings.rate_limit_requests,
        window=settings.rate_limit_window_seconds,
    )
    app.add_middleware(RequestContextMiddleware)
    register_error_handlers(app)

    def get_session(request: Request):
        yield from request.app.state.database.dependency()

    SessionDep = Annotated[Session, Depends(get_session)]

    bearer_scheme = HTTPBearer(auto_error=False)
    api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)

    def get_principal(
        request: Request,
        session: SessionDep,
        _bearer: Annotated[
            HTTPAuthorizationCredentials | None, Security(bearer_scheme)
        ] = None,
        _api_key: Annotated[str | None, Security(api_key_scheme)] = None,
    ) -> Principal:
        return authenticator.authenticate(request, session)

    PrincipalDep = Annotated[Principal, Depends(get_principal)]

    def authorize(
        session: Session,
        principal: Principal,
        workspace_id: str,
        minimum: WorkspaceRole = WorkspaceRole.VIEWER,
        scope: str = "workspace:read",
    ) -> None:
        if principal.api_key_id:
            if principal.workspace_id != workspace_id:
                from workspace_api.errors import AuthorizationError

                raise AuthorizationError("API key belongs to another workspace")
            principal.require_scope(scope)
            return
        if not principal.user_id:
            from workspace_api.errors import AuthenticationError

            raise AuthenticationError()
        workspace_service.require_role(
            session, workspace_id, principal.user_id, minimum
        )

    def human_admin(
        session: Session, principal: Principal, workspace_id: str
    ) -> str:
        if not principal.user_id:
            from workspace_api.errors import AuthorizationError

            raise AuthorizationError("Human workspace administrator required")
        workspace_service.require_role(
            session, workspace_id, principal.user_id, WorkspaceRole.ADMIN
        )
        return principal.user_id

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "oneshot-workspace-api"}

    @app.post(
        f"{settings.api_prefix}/auth/register",
        response_model=RegisterResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["auth"],
    )
    def register(request: RegisterRequest, session: SessionDep) -> RegisterResponse:
        user, workspace = auth_service.register(session, request)
        ollama = session.scalar(
            select(ModelProvider).where(ModelProvider.slug == "ollama-local")
        )
        if ollama:
            session.add(
                ModelConfiguration(
                    workspace_id=workspace.id,
                    provider_id=ollama.id,
                    public_name="default",
                    provider_model_id="gemma2:9b",
                    is_default=True,
                    priority=10,
                    weight=1,
                )
            )
        token, expires = tokens.create_access_token(user.id)
        return RegisterResponse(
            user=UserRead.model_validate(user),
            workspace=WorkspaceRead.model_validate(workspace),
            token=TokenResponse(access_token=token, expires_in=expires),
        )

    @app.post(
        f"{settings.api_prefix}/auth/login",
        response_model=TokenResponse,
        tags=["auth"],
    )
    def login(request: LoginRequest, session: SessionDep) -> TokenResponse:
        user = auth_service.authenticate(
            session, str(request.email), request.password.get_secret_value()
        )
        token, expires = tokens.create_access_token(user.id)
        return TokenResponse(access_token=token, expires_in=expires)

    @app.get(f"{settings.api_prefix}/users/me", response_model=UserRead, tags=["auth"])
    def me(principal: PrincipalDep, session: SessionDep) -> User:
        if not principal.user_id:
            from workspace_api.errors import AuthorizationError

            raise AuthorizationError("A human user token is required")
        user = session.get(User, principal.user_id)
        if not user:
            raise NotFoundError("user", principal.user_id)
        return user

    @app.get(
        f"{settings.api_prefix}/workspaces",
        response_model=list[WorkspaceRead],
        tags=["workspaces"],
    )
    def list_workspaces(principal: PrincipalDep, session: SessionDep):
        if not principal.user_id:
            workspace = session.get(Workspace, principal.workspace_id)
            return [workspace] if workspace else []
        return session.scalars(
            select(Workspace)
            .join(WorkspaceMembership)
            .where(WorkspaceMembership.user_id == principal.user_id)
            .order_by(Workspace.name)
        ).all()

    @app.post(
        f"{settings.api_prefix}/workspaces",
        response_model=WorkspaceRead,
        status_code=status.HTTP_201_CREATED,
        tags=["workspaces"],
    )
    def create_workspace(
        request: WorkspaceCreate, principal: PrincipalDep, session: SessionDep
    ) -> Workspace:
        if not principal.user_id:
            from workspace_api.errors import AuthorizationError

            raise AuthorizationError("A human user token is required")
        return workspace_service.create(
            session, principal.user_id, request.name, request.slug
        )

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}",
        response_model=WorkspaceRead,
        tags=["workspaces"],
    )
    def get_workspace(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ) -> Workspace:
        authorize(session, principal, workspace_id)
        workspace = session.get(Workspace, workspace_id)
        if not workspace:
            raise NotFoundError("workspace", workspace_id)
        return workspace

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/subscription",
        response_model=SubscriptionRead,
        tags=["workspaces"],
    )
    def get_subscription(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ) -> Subscription:
        authorize(session, principal, workspace_id, scope="usage:read")
        subscription = session.scalar(
            select(Subscription).where(Subscription.workspace_id == workspace_id)
        )
        if not subscription:
            raise NotFoundError("subscription", workspace_id)
        return subscription

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/members",
        response_model=MembershipRead,
        status_code=status.HTTP_201_CREATED,
        tags=["workspaces"],
    )
    def add_member(
        workspace_id: str,
        request: MembershipCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> WorkspaceMembership:
        actor = human_admin(session, principal, workspace_id)
        return workspace_service.add_member(
            session, workspace_id, actor, str(request.user_email), request.role
        )

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/members",
        response_model=list[MembershipRead],
        tags=["workspaces"],
    )
    def list_members(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ):
        authorize(session, principal, workspace_id)
        return session.scalars(
            select(WorkspaceMembership)
            .where(WorkspaceMembership.workspace_id == workspace_id)
            .order_by(WorkspaceMembership.created_at)
        ).all()

    @app.get(
        f"{settings.api_prefix}/providers",
        response_model=list[ProviderRead],
        tags=["models"],
    )
    def list_providers(_principal: PrincipalDep, session: SessionDep):
        return session.scalars(
            select(ModelProvider)
            .where(ModelProvider.enabled.is_(True))
            .order_by(ModelProvider.display_name)
        ).all()

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/credentials",
        response_model=ProviderCredentialRead,
        status_code=status.HTTP_201_CREATED,
        tags=["credentials"],
    )
    def create_credential(
        workspace_id: str,
        request: ProviderCredentialCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ProviderCredential:
        actor = human_admin(session, principal, workspace_id)
        credential = credential_service.create_provider_credential(
            session,
            workspace_id=workspace_id,
            provider_id=request.provider_id,
            name=request.name,
            secret=request.secret.get_secret_value(),
            expires_at=request.expires_at,
        )
        session.add(
            AuditLog(
                workspace_id=workspace_id,
                actor_user_id=actor,
                action="provider_credential.created",
                target_type="provider_credential",
                target_id=credential.id,
            )
        )
        return credential

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/credentials",
        response_model=list[ProviderCredentialRead],
        tags=["credentials"],
    )
    def list_credentials(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ):
        human_admin(session, principal, workspace_id)
        return session.scalars(
            select(ProviderCredential)
            .where(ProviderCredential.workspace_id == workspace_id)
            .order_by(ProviderCredential.created_at.desc())
        ).all()

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/credentials/{{credential_id}}/rotate",
        response_model=ProviderCredentialRead,
        tags=["credentials"],
    )
    def rotate_credential(
        workspace_id: str,
        credential_id: str,
        request: ProviderCredentialRotate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ProviderCredential:
        actor = human_admin(session, principal, workspace_id)
        replacement = credential_service.rotate_provider_credential(
            session,
            workspace_id=workspace_id,
            credential_id=credential_id,
            secret=request.secret.get_secret_value(),
            expires_at=request.expires_at,
        )
        session.add(
            AuditLog(
                workspace_id=workspace_id,
                actor_user_id=actor,
                action="provider_credential.rotated",
                target_type="provider_credential",
                target_id=replacement.id,
                details_json={"rotated_from_id": credential_id},
            )
        )
        return replacement

    @app.delete(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/credentials/{{credential_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["credentials"],
    )
    def revoke_credential(
        workspace_id: str,
        credential_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> Response:
        actor = human_admin(session, principal, workspace_id)
        credential_service.revoke_provider_credential(
            session, workspace_id, credential_id
        )
        session.add(
            AuditLog(
                workspace_id=workspace_id,
                actor_user_id=actor,
                action="provider_credential.revoked",
                target_type="provider_credential",
                target_id=credential_id,
            )
        )
        return Response(status_code=204)

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/api-keys",
        response_model=WorkspaceApiKeyIssued,
        status_code=status.HTTP_201_CREATED,
        tags=["credentials"],
    )
    def create_api_key(
        workspace_id: str,
        request: WorkspaceApiKeyCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> WorkspaceApiKeyIssued:
        actor = human_admin(session, principal, workspace_id)
        issued = credential_service.create_workspace_api_key(
            session,
            workspace_id=workspace_id,
            user_id=actor,
            name=request.name,
            scopes=request.scopes,
            expires_at=request.expires_at,
        )
        payload = WorkspaceApiKeyRead.model_validate(issued.record).model_dump()
        return WorkspaceApiKeyIssued(**payload, secret=issued.secret)

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/api-keys",
        response_model=list[WorkspaceApiKeyRead],
        tags=["credentials"],
    )
    def list_api_keys(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ):
        human_admin(session, principal, workspace_id)
        return session.scalars(
            select(WorkspaceApiKey)
            .where(WorkspaceApiKey.workspace_id == workspace_id)
            .order_by(WorkspaceApiKey.created_at.desc())
        ).all()

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/api-keys/{{key_id}}/rotate",
        response_model=WorkspaceApiKeyIssued,
        tags=["credentials"],
    )
    def rotate_api_key(
        workspace_id: str,
        key_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> WorkspaceApiKeyIssued:
        actor = human_admin(session, principal, workspace_id)
        issued = credential_service.rotate_workspace_api_key(
            session,
            workspace_id=workspace_id,
            user_id=actor,
            key_id=key_id,
        )
        payload = WorkspaceApiKeyRead.model_validate(issued.record).model_dump()
        return WorkspaceApiKeyIssued(**payload, secret=issued.secret)

    @app.delete(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/api-keys/{{key_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["credentials"],
    )
    def revoke_api_key(
        workspace_id: str,
        key_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> Response:
        human_admin(session, principal, workspace_id)
        credential_service.revoke_workspace_api_key(session, workspace_id, key_id)
        return Response(status_code=204)

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/models",
        response_model=ModelConfigurationRead,
        status_code=status.HTTP_201_CREATED,
        tags=["models"],
    )
    def create_model(
        workspace_id: str,
        request: ModelConfigurationCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ModelConfiguration:
        human_admin(session, principal, workspace_id)
        provider = session.get(ModelProvider, request.provider_id)
        if not provider:
            raise NotFoundError("provider", request.provider_id)
        if request.credential_id:
            credential = session.get(ProviderCredential, request.credential_id)
            if (
                not credential
                or credential.workspace_id != workspace_id
                or credential.provider_id != provider.id
                or credential.status != CredentialStatus.ACTIVE
            ):
                raise ConflictError("Credential is not active for this provider")
        if request.is_default:
            session.execute(
                update(ModelConfiguration)
                .where(
                    ModelConfiguration.workspace_id == workspace_id,
                    ModelConfiguration.public_name != request.public_name,
                )
                .values(is_default=False)
            )
        model = ModelConfiguration(
            workspace_id=workspace_id,
            **request.model_dump(),
        )
        session.add(model)
        session.flush()
        return model

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/models",
        response_model=list[ModelConfigurationRead],
        tags=["models"],
    )
    def list_models(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ):
        authorize(session, principal, workspace_id, scope="models:read")
        return session.scalars(
            select(ModelConfiguration)
            .where(ModelConfiguration.workspace_id == workspace_id)
            .order_by(
                ModelConfiguration.public_name,
                ModelConfiguration.priority,
                ModelConfiguration.provider_model_id,
            )
        ).all()

    @app.patch(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/models/{{model_id}}/availability",
        response_model=ModelConfigurationRead,
        tags=["models"],
    )
    def update_availability(
        workspace_id: str,
        model_id: str,
        request: AvailabilityUpdate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ModelConfiguration:
        human_admin(session, principal, workspace_id)
        model = session.get(ModelConfiguration, model_id)
        if not model or model.workspace_id != workspace_id:
            raise NotFoundError("model configuration", model_id)
        model.availability = request.status
        model.last_checked_at = datetime.now(timezone.utc)
        session.add(
            ModelHealthSnapshot(
                model_config_id=model.id,
                status=request.status,
                latency_ms=request.latency_ms,
                error_code=request.error_code,
            )
        )
        return model

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/conversations",
        response_model=ConversationRead,
        status_code=status.HTTP_201_CREATED,
        tags=["chat"],
    )
    def create_conversation(
        workspace_id: str,
        request: ConversationCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> Conversation:
        authorize(session, principal, workspace_id, WorkspaceRole.MEMBER, "chat:write")
        conversation = Conversation(
            workspace_id=workspace_id,
            created_by_user_id=principal.user_id,
            **request.model_dump(),
        )
        session.add(conversation)
        session.flush()
        return conversation

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/conversations",
        response_model=list[ConversationRead],
        tags=["chat"],
    )
    def list_conversations(
        workspace_id: str, principal: PrincipalDep, session: SessionDep
    ):
        authorize(session, principal, workspace_id, scope="chat:read")
        return session.scalars(
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(Conversation.updated_at.desc())
        ).all()

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/conversations/{{conversation_id}}/messages",
        response_model=list[ChatMessageRead],
        tags=["chat"],
    )
    def list_messages(
        workspace_id: str,
        conversation_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ):
        authorize(session, principal, workspace_id, scope="chat:read")
        conversation = session.get(Conversation, conversation_id)
        if not conversation or conversation.workspace_id != workspace_id:
            raise NotFoundError("conversation", conversation_id)
        return session.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.sequence)
        ).all()

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/context",
        response_model=ContextItemRead,
        status_code=status.HTTP_201_CREATED,
        tags=["chat"],
    )
    def create_context_item(
        workspace_id: str,
        body: ContextItemCreate,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ContextItem:
        authorize(session, principal, workspace_id, WorkspaceRole.MEMBER, "chat:write")
        if body.conversation_id:
            conversation = session.get(Conversation, body.conversation_id)
            if not conversation or conversation.workspace_id != workspace_id:
                raise NotFoundError("conversation", body.conversation_id)
        item = ContextItem(workspace_id=workspace_id, **body.model_dump())
        session.add(item)
        session.flush()
        return item

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/context",
        response_model=list[ContextItemRead],
        tags=["chat"],
    )
    def list_context_items(
        workspace_id: str,
        principal: PrincipalDep,
        session: SessionDep,
        conversation_id: Annotated[str | None, Query()] = None,
        pinned: Annotated[bool | None, Query()] = None,
    ):
        authorize(session, principal, workspace_id, scope="chat:read")
        statement = select(ContextItem).where(ContextItem.workspace_id == workspace_id)
        if conversation_id is not None:
            statement = statement.where(ContextItem.conversation_id == conversation_id)
        if pinned is not None:
            statement = statement.where(ContextItem.pinned == pinned)
        return session.scalars(statement.order_by(ContextItem.created_at)).all()

    @app.delete(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/context/{{context_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["chat"],
    )
    def delete_context_item(
        workspace_id: str,
        context_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> Response:
        authorize(session, principal, workspace_id, WorkspaceRole.MEMBER, "chat:write")
        item = session.get(ContextItem, context_id)
        if not item or item.workspace_id != workspace_id:
            raise NotFoundError("context item", context_id)
        session.delete(item)
        return Response(status_code=204)

    @app.delete(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/conversations/{{conversation_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["chat"],
    )
    def archive_conversation(
        workspace_id: str,
        conversation_id: str,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> Response:
        authorize(session, principal, workspace_id, WorkspaceRole.MEMBER, "chat:write")
        conversation = session.get(Conversation, conversation_id)
        if not conversation or conversation.workspace_id != workspace_id:
            raise NotFoundError("conversation", conversation_id)
        conversation.status = ConversationStatus.ARCHIVED
        return Response(status_code=204)

    @app.post(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/chat/completions",
        response_model=ChatCompletionResponse,
        tags=["chat"],
    )
    async def chat_completion(
        workspace_id: str,
        body: ChatCompletionRequest,
        request: Request,
        principal: PrincipalDep,
        session: SessionDep,
    ) -> ChatCompletionResponse:
        authorize(session, principal, workspace_id, WorkspaceRole.MEMBER, "chat:write")
        result = await chat_service.complete(
            session,
            principal,
            workspace_id,
            body,
            request.state.request_id,
        )
        return ChatCompletionResponse(
            conversation=ConversationRead.model_validate(result.conversation),
            message=ChatMessageRead.model_validate(result.message),
            model=ModelConfigurationRead.model_validate(result.route.model),
            usage=UsageRead(
                request_id=result.usage_event.request_id,
                input_tokens=result.usage_event.input_tokens,
                output_tokens=result.usage_event.output_tokens,
                total_tokens=result.usage_event.total_tokens,
                cost_usd=result.usage_event.cost_usd,
                latency_ms=result.usage_event.latency_ms,
            ),
        )

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/usage",
        response_model=UsageSummary,
        tags=["usage"],
    )
    def usage_summary(
        workspace_id: str,
        principal: PrincipalDep,
        session: SessionDep,
        start: Annotated[datetime | None, Query()] = None,
        end: Annotated[datetime | None, Query()] = None,
    ) -> UsageSummary:
        authorize(session, principal, workspace_id, scope="usage:read")
        now = datetime.now(timezone.utc)
        period_start = start or _period_start(now)
        period_end = end or _period_end(now)
        if period_end <= period_start:
            raise ConflictError("Usage end must be after start")
        return UsageSummary(**usage.summary(session, workspace_id, period_start, period_end))

    @app.get(
        f"{settings.api_prefix}/workspaces/{{workspace_id}}/usage/events",
        response_model=list[UsageEventRead],
        tags=["usage"],
    )
    def usage_events(
        workspace_id: str,
        principal: PrincipalDep,
        session: SessionDep,
        limit: Annotated[int, Query(ge=1, le=500)] = 100,
        offset: Annotated[int, Query(ge=0)] = 0,
    ):
        authorize(session, principal, workspace_id, scope="usage:read")
        return session.scalars(
            select(UsageEvent)
            .where(UsageEvent.workspace_id == workspace_id)
            .order_by(UsageEvent.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()

    return app
