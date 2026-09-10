# Provider / Researcher Boundary Migration

Status: APPROVED

## Goal

Separate model providers from the Researcher role without changing the canonical OneShot workflow.

## Locked invariant

- Provider is model transport/configuration only.
- Provider must not expose `research()` and must not return `ResearchBundle`.
- Researcher is the backend role that owns evidence collection, research instructions, structured draft validation/retry, canonical `ResearchBundle`, Plan/Schema/Fixture/Goal/Validation construction, and canonical validation.
- `app/web` must not own backend provider runtime.
- Prompt ID remains the trigger into the backend Researcher workflow.

## Scope

1. Add backend-owned provider modules under `backend/provider/`.
2. Use `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google` as the live model transports.
3. Move provider runtime config, credential storage, provider selection, run capture, and connection testing to backend ownership.
4. Move structured Researcher draft parsing and canonical bundle construction into `backend/agents/researcher/`.
5. Change Researcher to collect evidence and call a generic text-model interface; provider adapters do not know OneShot Researcher contracts.
6. Update pipeline/bootstrap/runtime imports to backend provider modules.
7. Remove `app/web/cloud` provider runtime from TypeScript compilation and replace tests that assert the old web-owned provider architecture.
8. Keep deterministic sample behavior as a Researcher test/runtime source, not a user-selectable LLM provider.

## Out of scope

- Canonical workflow redesign.
- Planner/Refactor/Gap/Evaluation/Builder behavior changes.
- Frontend UI rebuild.
- Workspace Python API relocation.
- Credential-policy weakening.

## Verification

- `npm ci`
- `npm run build:backend`
- provider tests
- Researcher tests
- pipeline E2E
- grep/source guard: backend provider/Researcher runtime has no imports from `app/web`.
- official provider adapters compile against installed AI SDK packages.

## Execution state

APPROVED — implementation authorized by user on 2026-09-10.
