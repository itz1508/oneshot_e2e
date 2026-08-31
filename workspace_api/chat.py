"""Durable conversation/context orchestration around the model router.

Incoming messages are committed before the external provider call. The result
or a sanitized usage failure event is committed afterward, keeping database
transactions short across network I/O.

Example::

    result = await chat.complete(session, principal, workspace_id, request, request_id)
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from workspace_api.auth import Principal
from workspace_api.config import WorkspaceSettings
from workspace_api.errors import AppError, ConflictError, NotFoundError
from workspace_api.models import (
    ChatMessage,
    ContextItem,
    Conversation,
    ConversationStatus,
    MessageRole,
    UsageEvent,
)
from workspace_api.providers import ModelRequest, ProviderMessage
from workspace_api.router import ModelRouter, RouteResult
from workspace_api.schemas import ChatCompletionRequest
from workspace_api.usage import UsageTracker


@dataclass(frozen=True, slots=True)
class ChatResult:
    conversation: Conversation
    message: ChatMessage
    route: RouteResult
    usage_event: UsageEvent


class ChatService:
    """Persist ordered chat history, assemble context, route, and account usage."""

    def __init__(
        self,
        settings: WorkspaceSettings,
        router: ModelRouter,
        usage: UsageTracker,
    ) -> None:
        self.settings = settings
        self.router = router
        self.usage = usage

    def _conversation(
        self,
        session: Session,
        workspace_id: str,
        principal: Principal,
        request: ChatCompletionRequest,
    ) -> Conversation:
        if request.conversation_id:
            conversation = session.get(Conversation, request.conversation_id)
            if not conversation or conversation.workspace_id != workspace_id:
                raise NotFoundError("conversation", request.conversation_id)
            if conversation.status != ConversationStatus.ACTIVE:
                raise ConflictError("Conversation is archived")
            return conversation
        first_user = next(
            (
                message.content
                for message in request.messages
                if message.role == MessageRole.USER
            ),
            "New conversation",
        )
        conversation = Conversation(
            workspace_id=workspace_id,
            created_by_user_id=principal.user_id,
            title=first_user.strip().replace("\n", " ")[:200],
        )
        session.add(conversation)
        session.flush()
        return conversation

    @staticmethod
    def _next_sequence(session: Session, conversation_id: str) -> int:
        current = session.scalar(
            select(func.max(ChatMessage.sequence)).where(
                ChatMessage.conversation_id == conversation_id
            )
        )
        return int(current or 0) + 1

    def _append_input(
        self,
        session: Session,
        conversation: Conversation,
        request: ChatCompletionRequest,
    ) -> None:
        sequence = self._next_sequence(session, conversation.id)
        for incoming in request.messages:
            session.add(
                ChatMessage(
                    conversation_id=conversation.id,
                    sequence=sequence,
                    role=incoming.role,
                    content=incoming.content,
                    metadata_json=incoming.metadata_json,
                )
            )
            sequence += 1
        session.flush()

    def _context(self, session: Session, conversation: Conversation) -> ModelRequest:
        pinned = session.scalars(
            select(ContextItem).where(
                ContextItem.workspace_id == conversation.workspace_id,
                ContextItem.pinned.is_(True),
                (ContextItem.conversation_id.is_(None))
                | (ContextItem.conversation_id == conversation.id),
            )
        ).all()
        recent_desc = session.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.sequence.desc())
            .limit(self.settings.context_message_limit)
        ).all()
        messages = [
            ProviderMessage(
                role=MessageRole.SYSTEM,
                content=f"Context from {item.source}:\n{item.content}",
            )
            for item in pinned
        ]
        messages.extend(
            ProviderMessage(role=message.role, content=message.content)
            for message in reversed(recent_desc)
        )
        return ModelRequest(messages=messages)

    async def complete(
        self,
        session: Session,
        principal: Principal,
        workspace_id: str,
        request: ChatCompletionRequest,
        request_id: str,
    ) -> ChatResult:
        """Persist input, perform routed inference, persist output and accounting."""

        self.usage.assert_quota(session, workspace_id)
        conversation = self._conversation(session, workspace_id, principal, request)
        self._append_input(session, conversation, request)
        conversation_id = conversation.id
        session.commit()

        model_request = self._context(session, conversation)
        model_request = ModelRequest(
            messages=model_request.messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        started = time.perf_counter()
        route: RouteResult | None = None
        try:
            route = await self.router.complete(
                session, workspace_id, model_request, request.model
            )
            latency_ms = int((time.perf_counter() - started) * 1000)
            sequence = self._next_sequence(session, conversation_id)
            message = ChatMessage(
                conversation_id=conversation_id,
                sequence=sequence,
                role=MessageRole.ASSISTANT,
                content=route.result.content,
                model_config_id=route.model.id,
                provider_message_id=route.result.provider_request_id,
                token_count=route.result.usage.output_tokens,
                metadata_json=route.result.metadata,
            )
            session.add(message)
            usage_event = self.usage.record_success(
                session,
                request_id=request_id,
                workspace_id=workspace_id,
                user_id=principal.user_id,
                api_key_id=principal.api_key_id,
                conversation_id=conversation_id,
                model=route.model,
                provider=route.provider,
                result=route.result,
                latency_ms=latency_ms,
            )
            conversation.active_model_config_id = route.model.id
            session.commit()
            return ChatResult(conversation, message, route, usage_event)
        except AppError as error:
            latency_ms = int((time.perf_counter() - started) * 1000)
            self.usage.record_error(
                session,
                request_id=request_id,
                workspace_id=workspace_id,
                user_id=principal.user_id,
                api_key_id=principal.api_key_id,
                conversation_id=conversation_id,
                model=route.model if route else None,
                provider=route.provider if route else None,
                latency_ms=latency_ms,
                error_code=error.code,
                error_message=error.message,
            )
            session.commit()
            raise
