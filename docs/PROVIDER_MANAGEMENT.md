# Provider Management

## Overview

OneShot's provider management system allows users to configure and select research providers through a web UI. The system is designed with security as a primary concern: **credentials never enter the frontend bundle, browser storage, or BullMQ job payloads**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Frontend)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     providers-panel.js                               │   │
│  │  - Renders provider catalog with non-secret status                  │   │
│  │  - Active provider selection                                        │   │
│  │  - Credential input (password field, never prefilled)               │   │
│  │  - Test connection / Save / Activate / Remove credential            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ HTTPS (origin-protected, API-token for non-loopback)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Backend (HTTP Server)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        http-server.ts                                │   │
│  │  GET    /api/providers           → list catalog + status            │   │
│  │  GET    /api/providers/:id       → provider status (no secret)      │   │
│  │  PUT    /api/providers/:id       → update non-secret config         │   │
│  │  PUT    /api/providers/:id/credential → store credential (write-only)│   │
│  │  DELETE /api/providers/:id/credential → remove local credential     │   │
│  │  POST   /api/providers/:id/test → test connection (transient)       │   │
│  │  POST   /api/providers/:id/activate → set active provider           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ProviderManager                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐  │
│  │   ProviderCatalog   │  │ ProviderConfigStore │  │ ProviderSecretStore│  │
│  │  (providers.json)   │  │ (.runtime/config/)  │  │  (OS user config)  │  │
│  │  - Git-tracked      │  │  - Non-secret only  │  │  - Write-only      │  │
│  │  - Supported types  │  │  - model, apiBase   │  │  - Never to browser│  │
│  └─────────────────────┘  └─────────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Provider Configuration Precedence

Provider credentials are resolved in the following order (highest priority first):

1. **Environment variable** (e.g., `FEATHERLESS_API_KEY`) - deployment/admin-controlled
2. **Local secret store** (`~/.config/oneshot/secrets/` on Linux, `~/Library/Application Support/OneShot/secrets/` on macOS, `%APPDATA%\OneShot\secrets\` on Windows) - user-controlled via UI
3. **None** - provider is unconfigured

Non-secret configuration (model, apiBase, timeout, parallelism) is stored in `.runtime/config/providers.json` and can be updated via the UI without affecting credentials.

## Security Invariants

1. **Credentials are write-only from the browser** - the browser may submit a credential but can never retrieve it
2. **Credentials never appear in HTTP responses** - `GET /api/providers` returns only `{ configured: boolean, credentialSource: "local-secret-store" | "env-var" | "none" }`
3. **Credentials never enter BullMQ job payloads** - jobs carry only `{ id, model, configRevision }`
4. **Credentials never enter ProcessingEvents** - event data contains only diagnostic messages
5. **Credentials are never logged** - error messages use sanitized content
6. **Environment credentials cannot be deleted from the UI** - they are admin-controlled
7. **Secret storage is outside the workspace** - never web-servable
7. **Secret storage is outside the workspace** - never web-servable

## Supported Providers

| ID | Label | Type | Credential | Credential Env |
|---|---|---|---|---|
| `sample` | OneShot Sample | fixture | none | - |
| `featherless` | Featherless AI | featherless | api_key | `FEATHERLESS_API_KEY` |
| `adk_gemma2` | Google ADK / Gemma | adk_gemma2 | api_key | - |

## File Locations

| Artifact | Location | Git-tracked | Web-served |
|---|---|---|---|
| Provider catalog | `backend/config/providers.json` | Yes | No |
| Non-secret runtime config | `.runtime/config/providers.json` | No | No |
| Provider credentials | OS user config directory | No | No |
| Run state | `.runtime/run-state/` | No | No |
| Event store | `.runtime/task-events/` | No | No |

## API Endpoints

- `GET /api/providers` - list catalog + status
- `GET /api/providers/:id` - provider status (no secret)
- `PUT /api/providers/:id` - update non-secret config
- `PUT /api/providers/:id/credential` - store credential (write-only)
- `DELETE /api/providers/:id/credential` - remove local credential
- `POST /api/providers/:id/test` - test connection (transient)
- `POST /api/providers/:id/activate` - set active provider

## Run Submission Flow

```
User submits run → POST /api/runs
  → ProviderManager.runtimeConfig() → { activeProvider, revision, model }
  → BullMQ addRun({ runId, prompt, provider: { id, model, configRevision } })
  → (no credential in payload!)
Worker dequeues → ProviderManager.createProvider() → resolves credential server-side
  → ProviderBinding event → Researcher → ... → DONE
```

## SSE Reconnect

1. Client connects, receives all events with `id: <sequence>` framing
2. Client disconnects (browser close/refresh)
3. Worker continues processing
4. Client reconnects with `Last-Event-ID: <last-sequence>` header
5. Server replays only events after that sequence
6. Live events continue without duplication

## Redis/BullMQ Infrastructure

- **Queue name:** `oneshot:run` (colon-free for BullMQ v6)
- **Redis key prefix:** `oneshot` (configurable via `ONESHOT_QUEUE_PREFIX`)
- **Retry policy:** attempts=1 (no automatic retry)
- **Graceful shutdown:** server → queue → provider manager → validation lanes → bridge

## Failure Recovery

- **Redis offline at submission:** Returns 503, run finalized as ROOT_CAUSE
- **Worker crash mid-workflow:** No auto-retry; partial execution detected and refused
- **Server restart with Redis running:** Waiting jobs remain queued; worker resumes
- **Browser disconnect:** Only SSE subscription cancelled; BullMQ job continues

## Never Do These Things

- Put `providers.json` containing keys in `frontend/public`
- Use `VITE_*` API keys
- Save keys in `localStorage`
- Return masked versions of actual keys (masking leaks length)
- Mutate `process.env` per run
- Put provider keys in BullMQ payloads
- Replace ProcessingEvent with BullMQ state
- Replace durable event history with Redis-only retention
- Break Sample Mode
- Silently fall back to direct execution when Redis fails (unless `ONESHOT_QUEUE_REQUIRED=false`)
- Claim readiness when Redis/worker is unavailable

## Docker Deployment

See `docker-compose.local.yml` for a complete local development setup with Redis.
