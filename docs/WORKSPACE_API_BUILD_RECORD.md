# OneShot Workspace API Build Record

Last updated: 2026-08-31

## Objective

Provide a complete Python implementation for workspace tenancy, model
configuration/routing, API-key management and rotation, usage analytics, chat
history/context, FastAPI, SQLAlchemy, typed settings, structured errors/logging,
rate limiting, and usage tracking.

## Authority and isolation

- Implementation root: `workspace_api/`.
- Schema/API design: `docs/WORKSPACE_API_DESIGN.md`.
- Dependency profile: `requirements-workspace-api.txt`.
- Test authority: `tests/test_workspace_api.py`.
- Existing TypeScript workflow, ResearchProvider boundary, hashes, Task
  Management, sandbox, and IDE structure are unchanged.
- `oneshot-ai-workspace/` was not reused because prior records classify it as an
  alternate scaffold rather than active source authority.

## Implemented files

| File | Responsibility |
|---|---|
| `config.py` | Typed environment settings and fail-closed production validation. |
| `database.py` | SQLAlchemy engine/session/schema lifecycle. |
| `models.py` | Complete relational schema and enum constraints. |
| `schemas.py` | Pydantic/OpenAPI requests and responses. |
| `security.py` | Argon2, JWT, MultiFernet, HMAC API keys. |
| `auth.py` | JWT and workspace API-key principal resolution. |
| `services.py` | User/workspace/key lifecycle and authorization rules. |
| `providers.py` | OpenAI-compatible/Ollama, Gemini, and Anthropic clients. |
| `router.py` | Priority routing, smooth weighted balancing, health, and failover. |
| `chat.py` | Durable messages/context, routed inference, usage persistence. |
| `usage.py` | Quotas, fixed-point cost accounting, immutable events, summaries. |
| `rate_limit.py` | Memory and atomic Redis fixed-window middleware. |
| `observability.py` | Request IDs and structured logs. |
| `errors.py` | Stable sanitized error envelope. |
| `api.py` / `main.py` | FastAPI factory, REST endpoints, and ASGI entry point. |

## Verification status

At creation time, focused deterministic HTTP tests passed for:

- registration and JWT authentication;
- provider discovery;
- encrypted credential creation and rotation;
- model creation and routing;
- durable user/assistant chat history;
- token and cost accounting;
- workspace API-key issue, authentication, rotation, and old-key rejection;
- smooth weighted model balancing;
- deterministic memory rate limiting;
- generated OpenAPI and error schemas.

Final verification on 2026-08-31:

```text
python scripts/verify_workspace_api.py
  dependency profile                              PASSED
  workspace compile                               PASSED
  workspace tests                                 4 passed, 0 failed
  generated OpenAPI (25 paths + error schema)     PASSED

python scripts/verify_all.py
  Python                                          46 passed, 0 failed
  TypeScript                                      44 passed, 0 failed
  overall                                         ONESHOT_PRODUCTION_E2E_VERIFIED

python scripts/verify_dependencies.py --profile all
  all exact direct pins                           PASSED
```

Ruff was not installed, so no Ruff claim is recorded. Python compileall,
runtime imports, SQLAlchemy table creation, generated OpenAPI, deterministic
HTTP behavior, and the complete repository regression suite all passed.

External model calls are not made by the deterministic tests and must not be
reported as live provider proof.

## Resume point

Run:

```powershell
python scripts/verify_workspace_api.py
python scripts/verify_all.py
```

Both commands pass. The code implementation is complete. Remaining deployment
work is to supply production secrets, choose PostgreSQL/Redis, apply a managed
migration process for long-lived data, configure at least one live provider
route, and run a credentialed inference check.
