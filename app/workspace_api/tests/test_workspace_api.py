"""Executable proofs for the isolated OneShot Workspace API."""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from collections import Counter
from pathlib import Path

from fastapi.testclient import TestClient

from workspace_api.api import create_app
from workspace_api.config import WorkspaceSettings
from workspace_api.database import Database
from workspace_api.models import (
    ModelConfiguration,
    ModelProvider,
    ProviderCredential,
    ProviderKind,
)
from workspace_api.clients import ModelRequest, ModelResult, ModelUsage, ProviderMessage
from workspace_api.rate_limit import MemoryRateLimiter
from workspace_api.router import ModelRouter
from workspace_api.security import SecretCipher
from workspace_api.models import MessageRole


class FakeProvider:
    """Deterministic provider client proving routing without external billing."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []

    async def complete(self, provider, model, credential, request):
        self.calls.append((model.provider_model_id, credential))
        return ModelResult(
            content=f"verified:{model.provider_model_id}",
            provider_request_id=f"fake:{len(self.calls)}",
            usage=ModelUsage(input_tokens=11, output_tokens=7),
        )


class WorkspaceApiTests(unittest.TestCase):
    def test_integration_credential_model_chat_usage_and_rotation_path(self) -> None:
        with tempfile.TemporaryDirectory(prefix="oneshot-workspace-test-") as temp:
            database_path = Path(temp) / "workspace.db"
            settings = WorkspaceSettings(
                environment="test",
                database_url=f"sqlite:///{database_path.as_posix()}",
                auto_create_schema=True,
                log_json=False,
                rate_limit_requests=1000,
            )
            database = Database(settings)
            fake = FakeProvider()
            router = ModelRouter(
                settings,
                SecretCipher(settings),
                clients={ProviderKind.OPENAI_COMPATIBLE: fake},
            )
            app = create_app(settings, database=database, model_router=router)

            with TestClient(app) as client:
                created_workspace = client.post(
                    "/v1/workspaces",
                    json={"name": "Research Lab"},
                )
                self.assertEqual(created_workspace.status_code, 201, created_workspace.text)
                workspace_id = created_workspace.json()["id"]

                providers_resp = client.get("/v1/providers")
                self.assertEqual(providers_resp.status_code, 200, providers_resp.text)
                featherless_id = next(
                    item["id"]
                    for item in providers_resp.json()
                    if item["slug"] == "featherless"
                )

                created_credential = client.post(
                    f"/v1/workspaces/{workspace_id}/credentials",
                    json={
                        "provider_id": featherless_id,
                        "name": "primary",
                        "secret": "test-provider-secret",
                    },
                )
                self.assertEqual(created_credential.status_code, 201)
                credential = created_credential.json()
                self.assertNotIn("secret", credential)

                created_model = client.post(
                    f"/v1/workspaces/{workspace_id}/models",
                    json={
                        "provider_id": featherless_id,
                        "credential_id": credential["id"],
                        "public_name": "remote",
                        "provider_model_id": "google/gemma-4-31B-it",
                        "input_cost_per_million_usd": "1.0",
                        "output_cost_per_million_usd": "2.0",
                    },
                )
                self.assertEqual(created_model.status_code, 201, created_model.text)

                completion = client.post(
                    f"/v1/workspaces/{workspace_id}/chat/completions",
                    headers={"X-Request-ID": "workspace-test-request-1"},
                    json={
                        "model": "remote",
                        "messages": [
                            {"role": "user", "content": "Audit this project"}
                        ],
                    },
                )
                self.assertEqual(completion.status_code, 200, completion.text)
                completed = completion.json()
                self.assertEqual(
                    completed["message"]["content"],
                    "verified:google/gemma-4-31B-it",
                )
                self.assertEqual(completed["usage"]["total_tokens"], 18)
                self.assertEqual(fake.calls[-1][1], "test-provider-secret")

                messages = client.get(
                    f"/v1/workspaces/{workspace_id}/conversations/"
                    f"{completed['conversation']['id']}/messages",
                )
                self.assertEqual([item["role"] for item in messages.json()], ["user", "assistant"])

                context = client.post(
                    f"/v1/workspaces/{workspace_id}/context",
                    json={
                        "conversation_id": completed["conversation"]["id"],
                        "kind": "repository",
                        "source": "oneshot://repository",
                        "content": "Canonical project context",
                        "pinned": True,
                    },
                )
                self.assertEqual(context.status_code, 201, context.text)
                listed_context = client.get(
                    f"/v1/workspaces/{workspace_id}/context?pinned=true",
                )
                self.assertEqual(len(listed_context.json()), 1)

                usage = client.get(
                    f"/v1/workspaces/{workspace_id}/usage",
                )
                self.assertEqual(usage.status_code, 200, usage.text)
                self.assertEqual(usage.json()["requests"], 1)
                events = client.get(
                    f"/v1/workspaces/{workspace_id}/usage/events",
                )
                self.assertEqual(events.status_code, 200)
                self.assertEqual(events.json()[0]["request_id"], "workspace-test-request-1")

                rotated_credential = client.post(
                    f"/v1/workspaces/{workspace_id}/credentials/"
                    f"{credential['id']}/rotate",
                    json={"secret": "test-provider-secret-v2"},
                )
                self.assertEqual(rotated_credential.status_code, 200)
                completion2 = client.post(
                    f"/v1/workspaces/{workspace_id}/chat/completions",
                    headers={"X-Request-ID": "workspace-test-request-2"},
                    json={
                        "model": "remote",
                        "messages": [{"role": "user", "content": "Continue"}],
                    },
                )
                self.assertEqual(completion2.status_code, 200, completion2.text)
                self.assertEqual(fake.calls[-1][1], "test-provider-secret-v2")

                with database.session() as session:
                    stored = session.get(
                        ProviderCredential, rotated_credential.json()["id"]
                    )
                    self.assertIsNotNone(stored)
                    self.assertNotEqual(
                        stored.encrypted_secret, "test-provider-secret-v2"
                    )

    def test_weighted_router_balances_equal_priority_pool(self) -> None:
        with tempfile.TemporaryDirectory(prefix="oneshot-router-test-") as temp:
            settings = WorkspaceSettings(
                environment="test",
                database_url=f"sqlite:///{(Path(temp) / 'router.db').as_posix()}",
                log_json=False,
            )
            database = Database(settings)
            database.create_schema()
            fake = FakeProvider()
            router = ModelRouter(
                settings,
                SecretCipher(settings),
                clients={ProviderKind.OPENAI_COMPATIBLE: fake},
            )
            with database.session() as session:
                provider = ModelProvider(
                    slug="test-openai",
                    display_name="Test OpenAI",
                    kind=ProviderKind.OPENAI_COMPATIBLE,
                    base_url="https://example.invalid/v1",
                )
                from workspace_api.models import User, Workspace

                user = User(
                    email="router@example.com",
                    display_name="Router",
                    password_hash="not-used",
                )
                session.add_all([provider, user])
                session.flush()
                workspace = Workspace(
                    name="Router",
                    slug="router",
                    owner_user_id=user.id,
                )
                session.add(workspace)
                session.flush()
                session.add_all(
                    [
                        ModelConfiguration(
                            workspace_id=workspace.id,
                            provider_id=provider.id,
                            public_name="pool",
                            provider_model_id="model-a",
                            priority=10,
                            weight=1,
                        ),
                        ModelConfiguration(
                            workspace_id=workspace.id,
                            provider_id=provider.id,
                            public_name="pool",
                            provider_model_id="model-b",
                            priority=10,
                            weight=1,
                        ),
                    ]
                )
                session.flush()
                request = ModelRequest(
                    messages=[ProviderMessage(MessageRole.USER, "hello")]
                )

                async def route_four() -> list[str]:
                    selected = []
                    for _ in range(4):
                        result = await router.complete(
                            session, workspace.id, request, "pool"
                        )
                        selected.append(result.model.provider_model_id)
                    return selected

                counts = Counter(asyncio.run(route_four()))
                self.assertEqual(counts, {"model-a": 2, "model-b": 2})
            database.dispose()

    def test_memory_rate_limiter_is_deterministic(self) -> None:
        limiter = MemoryRateLimiter()

        async def check():
            return [await limiter.check("caller", 2, 60) for _ in range(3)]

        decisions = asyncio.run(check())
        self.assertEqual([item.allowed for item in decisions], [True, True, False])
        self.assertEqual(decisions[-1].remaining, 0)

    def test_openapi_exposes_bearer_free_same_origin_contract(self) -> None:
        settings = WorkspaceSettings(
            environment="test", database_url="sqlite://", log_json=False
        )
        schema = create_app(settings).openapi()
        self.assertNotIn("securitySchemes", schema["components"])
        self.assertIn("ErrorResponse", schema["components"]["schemas"])


if __name__ == "__main__":
    unittest.main()
