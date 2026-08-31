# OneShot AI Workspace Database and API Design

Last updated: 2026-08-31

## Boundary

`workspace_api/` is a Python control-plane sidecar. It owns users, workspace
tenancy, subscriptions, provider credentials, model configuration/routing,
chat/context storage, usage accounting, rate limiting, and its own HTTP API.

It does not replace or modify the existing TypeScript Intent → Prompt →
Researcher → Planner → validation → hash workflow. A future caller can invoke
the canonical workflow after workspace authorization without moving workflow
ownership into this service.

## Component flow

```text
HTTP request
  → request ID + structured log
  → fixed-window edge limiter (memory or Redis)
  → JWT user or hashed workspace API-key authentication
  → workspace role/scope authorization
  → subscription quota check
  → durable conversation/context assembly
  → database-driven ModelRouter
       → lowest priority tier first
       → smooth weighted round-robin inside a tier
       → retry/failover across configured routes
       ├─ OpenAI-compatible / Featherless
       ├─ Ollama OpenAI compatibility
       ├─ Gemini API or Vertex AI ADC
       └─ Anthropic Claude
  → assistant message + immutable usage event
  → normalized response/error
```

## Relational schema

```text
users ──< workspace_memberships >── workspaces ──1 subscriptions
                                      │
                                      ├──< provider_credentials >── model_providers
                                      ├──< workspace_api_keys
                                      ├──< model_configurations >── model_providers
                                      │        └──< model_health_snapshots
                                      ├──< conversations ──< chat_messages
                                      ├──< context_items
                                      ├──< usage_events
                                      └──< audit_logs
```

| Table | Responsibility and important constraints |
|---|---|
| `users` | Unique normalized email, Argon2 password hash, account status, login timestamps. |
| `workspaces` | Tenant boundary, unique slug, owner, active flag, workspace settings. |
| `workspace_memberships` | Unique user/workspace association with owner/admin/member/viewer role. |
| `subscriptions` | One row per workspace with status, RPM, monthly request/token/cost limits, and billing period. |
| `model_providers` | Global endpoint definitions and provider kind; never stores credentials. |
| `provider_credentials` | Workspace-scoped encrypted secret versions with active/retired/revoked states and rotation lineage. |
| `workspace_api_keys` | Workspace automation keys stored as HMAC-SHA256 digests; the raw key is returned once. |
| `model_configurations` | Workspace model alias, provider model ID, credential, priority, weight, limits, pricing, parameters, and availability. Multiple routes may share one alias. |
| `model_health_snapshots` | Append-only model availability, latency, and error-code observations. |
| `conversations` | Workspace-scoped chat container, creator, title, state, selected model, summary, metadata. |
| `chat_messages` | Immutable ordered messages; unique `(conversation_id, sequence)`. |
| `context_items` | Pinned or conversation-specific source context independent of chat messages. |
| `usage_events` | Immutable request, provider, token, cost, latency, status, and sanitized error facts. |
| `audit_logs` | Append-only credential/workspace administrative actions. |

All IDs are UUID strings for SQLite/PostgreSQL portability. JSON configuration
uses SQLAlchemy's generic JSON type. Costs use fixed-point `NUMERIC(18,8)`;
binary floating point is not used for billing data.

## Model routing

`ModelRouter` resolves enabled routes for the workspace and requested public
model alias or provider model ID. When no model is requested, all routes sharing
the configured default alias are eligible.

1. Disabled providers, disabled routes, and routes marked unavailable are
   excluded.
2. Lower numeric priority tiers run first.
3. Routes in a tier use smooth weighted round-robin.
4. A failed route records a health snapshot and the next route is tried.
5. Provider-specific results are normalized to content, token usage, provider
   request ID, and metadata.
6. The successful route and immutable usage event are persisted.

New workspaces receive local `gemma2:9b` through Ollama as the default model
configuration. This records intended routing; the availability remains unknown
until the first provider call or an explicit availability update.

## Provider options

| Provider kind | Authentication | Configuration |
|---|---|---|
| `ollama` | No secret; SDK compatibility requires the ignored value `ollama`. | Base URL should end in `/v1`, for example `http://localhost:11434/v1`. |
| `openai_compatible` | Encrypted workspace provider credential. | Provider base URL plus model ID; safe custom headers and model `parameters_json` are supported. |
| `gemini` | Encrypted API key, or ADC when provider `config_json.auth_mode` is `adc`. | Vertex mode accepts project/location and selects API v1. |
| `anthropic` | Encrypted workspace provider credential. | Claude model ID, max output tokens, and current SDK-supported model parameters. |

Seeded endpoints contain no keys. An administrator adds a credential, then
binds its ID to a model configuration. Rotating a provider credential creates a
new version, retires the previous version, and atomically rebinds affected model
configurations.

## Authentication and secret handling

- Human login returns a short-lived signed JWT. JWT payloads are signed, not
  encrypted, and contain only typed identity claims.
- Passwords use pwdlib's recommended Argon2 settings.
- Workspace automation keys start with `osk_`, are returned exactly once, and
  are stored only as HMAC-SHA256 digests using a server-side pepper.
- Provider API keys are encrypted with MultiFernet. The first configured key
  encrypts new secrets; older configured keys remain available for decryption.
- Provider credentials and workspace API keys have explicit rotation lineage,
  expiration, last-use, and active/retired/revoked states.
- Production startup rejects placeholder JWT/pepper values and missing Fernet
  keys.
- Secrets are never included in read schemas, request logs, usage events, or
  provider errors.

## Authorization

Human users are authorized by workspace membership role:

```text
viewer < member < admin < owner
```

Workspace API keys are locked to one workspace and authorized by scopes such as
`chat:write`, `chat:read`, `models:read`, and `usage:read`. Credential and API-key
administration always requires a human admin or owner.

## Rate limits and quotas

Two independent controls are applied:

1. HTTP middleware limits each credential fingerprint or client IP in a fixed
   window. Development uses an in-process lock-protected backend. Production can
   select Redis; its Lua script performs `INCR` and first-window `EXPIRE`
   atomically.
2. `UsageTracker` checks workspace subscription status plus per-minute,
   monthly request, monthly token, and monthly cost quotas before inference.

The immutable `usage_events` table remains the analytics/billing source of
truth. Aggregate responses are calculated over a half-open `[start, end)` time
range.

## REST API

The live OpenAPI document is `/openapi.json`; interactive documentation is
`/docs`.

| Method and path | Purpose |
|---|---|
| `POST /v1/auth/register` | Create user, owner workspace, subscription, and local Gemma default. |
| `POST /v1/auth/login` | Authenticate and issue an access token. |
| `GET /v1/users/me` | Current human user. |
| `GET/POST /v1/workspaces` | List or create workspaces. |
| `GET /v1/workspaces/{id}/subscription` | Read plan and quotas. |
| `GET/POST /v1/workspaces/{id}/members` | List/add members. |
| `GET /v1/providers` | List seeded provider endpoints. |
| `GET/POST /v1/workspaces/{id}/credentials` | List metadata or add encrypted provider secret. |
| `POST .../credentials/{id}/rotate` | Rotate provider credential and rebind models. |
| `DELETE .../credentials/{id}` | Revoke and detach a provider credential. |
| `GET/POST /v1/workspaces/{id}/api-keys` | List or issue workspace automation keys. |
| `POST .../api-keys/{id}/rotate` | Retire and replace a workspace API key. |
| `DELETE .../api-keys/{id}` | Revoke a workspace API key. |
| `GET/POST /v1/workspaces/{id}/models` | List or configure model routes. |
| `PATCH .../models/{id}/availability` | Record explicit availability observation. |
| `GET/POST /v1/workspaces/{id}/conversations` | List/create conversations. |
| `GET .../conversations/{id}/messages` | Ordered chat history. |
| `GET/POST /v1/workspaces/{id}/context` | List/create workspace or conversation context. |
| `POST /v1/workspaces/{id}/chat/completions` | Persist input, route inference, persist answer and usage. |
| `GET /v1/workspaces/{id}/usage` | Period aggregate. |
| `GET /v1/workspaces/{id}/usage/events` | Paginated immutable usage events. |

## Error contract

All expected API failures use this shape:

```json
{
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "The selected model provider request failed",
    "retryable": true,
    "request_id": "request-correlation-id",
    "details": {
      "provider": "featherless",
      "status_code": 503
    }
  }
}
```

Validation responses intentionally omit submitted values, preventing passwords
or provider secrets from being reflected into error responses.

## Configuration

All variables use the `ONESHOT_WORKSPACE_` prefix. See
`.env.workspace.example` for the full set.

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enables fail-closed secret checks. |
| `DATABASE_URL` | SQLite under `data/` | Use `postgresql+psycopg://...` for PostgreSQL. |
| `AUTO_CREATE_SCHEMA` | `true` | Development convenience; use managed migrations for long-lived production data. |
| `JWT_SECRET` | development placeholder | Independent random value required in production. |
| `API_KEY_PEPPER` | development placeholder | Independent random value required in production. |
| `ENCRYPTION_KEYS` | derived only outside production | Comma-separated Fernet keys, newest first. |
| `CONTEXT_MESSAGE_LIMIT` | `40` | Maximum recent messages sent to a provider. |
| `PROVIDER_TIMEOUT_SECONDS` | `120` | Per-provider call timeout. |
| `PROVIDER_MAX_RETRIES` | `2` | SDK transport retry count. |
| `RATE_LIMIT_BACKEND` | `memory` | Use `redis` for multiple instances. |
| `RATE_LIMIT_REQUESTS` | `120` | Coarse middleware requests per window. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Fixed window length. |
| `RATE_LIMIT_FAIL_OPEN` | `false` | Keep false for fail-closed production behavior. |
| `LOG_JSON` | `true` | Structured JSON logs when enabled. |

Generate a Fernet key without exposing another secret:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Setup and example usage

```powershell
python scripts/bootstrap.py --with-workspace-api
Copy-Item .env.workspace.example .env.workspace
python scripts/verify_workspace_api.py
uvicorn workspace_api.main:app --host 0.0.0.0 --port 8080
```

Register, then use the returned access token:

```http
POST /v1/auth/register
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "a-long-unique-password",
  "display_name": "Workspace Owner",
  "workspace_name": "OneShot Lab"
}
```

Create a Featherless credential and model route through the credential and
model endpoints. The secret is write-only:

```json
{
  "provider_id": "<featherless-provider-id>",
  "name": "primary",
  "secret": "<server-side-secret>"
}
```

```json
{
  "provider_id": "<featherless-provider-id>",
  "credential_id": "<credential-id>",
  "public_name": "remote-gemma",
  "provider_model_id": "google/gemma-4-31B-it",
  "priority": 100,
  "weight": 1
}
```

Then call:

```json
{
  "model": "remote-gemma",
  "messages": [
    {"role": "user", "content": "Audit this project"}
  ]
}
```

## Authoritative references

- FastAPI JWT/password security:
  https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
- FastAPI middleware:
  https://fastapi.tiangolo.com/tutorial/middleware/
- SQLAlchemy ORM and session lifecycle:
  https://docs.sqlalchemy.org/en/20/orm/session_basics.html
- Pydantic settings:
  https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- MultiFernet encryption and rotation:
  https://cryptography.io/en/latest/fernet/
- Redis rate limiting:
  https://redis.io/docs/latest/develop/use-cases/rate-limiter/redis-py/
- Google Gen AI Python SDK:
  https://googleapis.github.io/python-genai/
- Ollama OpenAI compatibility:
  https://docs.ollama.com/api/openai-compatibility
- Featherless OpenAI-compatible quickstart:
  https://featherless.ai/docs/quickstart-guide
- Anthropic Messages API:
  https://docs.anthropic.com/en/api/messages
