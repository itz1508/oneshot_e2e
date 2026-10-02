# AGENTS.md — OneShot Project Guidelines

Standard instructions for AI coding agents working on OneShot. Follow the open [agents.md](https://agents.md) specification stewarded by the Agentic AI Foundation (Linux Foundation).

 Standard language code writing in Python and function include error handling, and more at https://realpython.com/ref/best-practices/exception-handling/.

## Project Overview

OneShot provides **governed research tools, contextual discovery features, and deterministic runtime boundaries that any AI agent can use**. It exposes modular APIs (`/api/research/run`, `researchSkill`) and deterministic verification boundaries so coding agents (Gemini, Claude, OpenAI, Antigravity, Cursor) can gather verified codebase and web context, plan changes, and execute safely without unconstrained conveyor-belt execution.

## Setup Commands

- Install dependencies: `pnpm install --frozen-lockfile`
- Backend development server: `pnpm dev`
- Frontend development server: `pnpm --prefix frontend/web run dev`
- Full project launcher: `pnpm run oneshot`
- Production build: `pnpm run build`
- Frontend static build: `pnpm --prefix frontend/web run build`
- Frontend preview: `pnpm --prefix frontend/web run preview`
- Backend production start: `pnpm run start`

## Package Manager Standard

Use `pnpm` exclusively across scripts, installs, builds, and tests. Never use npm, yarn, or `npx`; use `pnpm exec` for local binaries.

## Prerequisites and Compatibility Holds

- **Node.js**: `>= 24.21.0` (all 8 workspace packages declare `engines.node: >=24.21.0`. Do not reintroduce `22.x ||` alternates).
- **pnpm**: `>= 11.27.1`
- **Python**: `3.12+` (uv-managed service in `backend/python/`; `pyproject.toml` declares, `uv.lock` pins, `uv sync --frozen` creates `.venv`. Scripts in `app/scripts/` run on system Python and need no install)
- **Dependency holds**: `openai` stays on 6.x (peer range of `@strands-agents/sdk@1.19.0`), `@types/node` on 24.x, TypeScript on 5.9, `undici-types` on 7.x.

## Code Style

- TypeScript strict mode.
- Single quotes, no semicolons.
- Prefer functional patterns.
- Node-compatible ESM import specifiers with `.js` extensions.
- Indentation: 2 spaces for backend/cloud, 4 spaces for frontend/Python.
- Keep line endings consistent with repository tracked files.

## Architecture & Stop Boundaries

OneShot enforces explicit human-governed stop boundaries across three distinct pathways:

1. **Normal Chat (Composer)**: Standard conversational requests, explanations, and quick queries without triggering research or planning workflows.
2. **Research Features (Gate 1 Boundary)**: Governed multi-phase discovery across local code and external sources (Tavily/providers) producing an authoritative `ResearchBundle`. Strictly **stops** at `READY_FOR_PLANNING` (Gate 1).
3. **Design_Planning Tools (Gate 2 Boundary)**: Architecture, gap, and dependency reviews producing an actionable plan. Strictly **stops** at `APPROVED PLAN` (Gate 2) awaiting human confirmation.
4. **Deterministic Sandbox Boundary**: Strictly isolated 4-partition sandbox (`/workspace`, `/scratch`, `/memories`, `/artifacts`), verified against RFC 8785 canonical JSON bytes and cryptographic SHA-256 byte equality.

## Response Verification Invariant — The Golden Rule

**"PASS" is superficial and meaningless on its own; a verified HTTP RESPONSE payload is the ONLY valid confirmation.**

1. **"PASS" is not proof**: A test, tool execution, or stage transition is NOT valid merely because it returns `pass`, `passed`, or exit code 0.
2. **Inspect the concrete response**: Verification MUST inspect the actual HTTP response payload, body fields, status codes, and cryptographic byte/hash equality against the expected contract.
3. **Backend first, zero frontend invention**: Features and contract fixtures execute on the backend first, emitting real data. Never invent client-side mock states, fake timers, or synthetic progress. UI states reflect real backend SSE streams and tool execution.

## No Fake Progress or Hardcoded Mocks

Never fabricate progress, fake timers, mock data, synthetic success, assistant responses, research results, tool execution, or validation success. UI states reflect real backend SSE streams, records, and tool execution.

## Testing & Verification Instructions

| Task | Command |
| :--- | :--- |
| Backend unit & contract tests (237 tests) | `pnpm test` |
| Python reasoning tests (5 tests) | `pnpm run test:python` |
| Python lint (Ruff) | `pnpm run lint:python` |
| Python format check (Ruff) | `pnpm run format:python` |
| Python env bootstrap (uv) | `pnpm run setup:python` |
| Runtime package tests (117 tests) | `pnpm run test:runtime` |
| Launcher, manifest policy and Vercel layout tests (39 tests) | `pnpm run test:scripts` |
| Frontend web tests (100 tests) | `pnpm --prefix frontend/web test` |
| Browser E2E tests (21 tests) | `pnpm run test:e2e` |
| Full 7/7 verification suite | `pnpm run verify` |
| Manifest integrity check | `python app/scripts/verify_manifest.py` |
| Regenerate manifest | `python app/scripts/generate_manifest.py` |
| Verify demo assets | `pnpm run verify:demo` |
| Sync demo assets into derived trees | `pnpm run sync:demo` |

## Canonical Sources

| Concern | Canonical location |
| :--- | :--- |
| Demo payload (only committed copy) | `public/demo` — `frontend/web/public/demo` and `frontend/web/dist/demo` are derived, gitignored build output written by `scripts/sync-demo-assets.mjs`; 4K masters and the unpublished portrait cut stay in gitignored `public/demo/archival/` |
| Production frontend | `frontend/web/app/` and `frontend/web/src/` |
| Reference-only alternate frontend | `frontend/web/src/components/main-screen/` |
| Backend HTTP/SSE entry | `backend/index.ts` |
| Environment loading | `backend/environment.ts` |
| Agent runtime package | `packages/agent-runtime/` |
| Workspace control plane | `app/workspace_api/` |
| Workflow engine | `backend/pipeline/` and `backend/workflow/` |
| Deterministic validation | `backend/validation/` and `app/validation/` |
| Manifest and integrity | `app/scripts/` |
| Root package manager config | `package.json` and `pnpm-workspace.yaml` |
| Root lockfile | `pnpm-lock.yaml` |
| CI and deployment | `.github/workflows/deploy.yml` |

`main-screen/` files under `frontend/web/src/` are reference-only. Do not edit `node_modules/`, `.next/`, or generated `dist/` output.

## Streaming & Event Standard (Agent Architecture)

The frontend and backend follow the Agent event streaming model:
- `stream.messages` carries assistant text deltas.
- `stream.subagents` carries delegated-agent lifecycle and messages.
- `stream.tool_calls` carries `tool_use`, `tool_running`, `tool_result`, and `tool_error` events.
- `stream.values.todos` carries real `pending`, `in_progress`, and `completed` state.
- No hardcoded percentages, artificial progress bars, fake tool execution, or synthetic delays.

## Strict Workspace Confinement and Path Rules

- **Strict Workspace Confinement**: Never read, search, modify, or inspect files outside the current Git workspace root without explicit user authorization.
- Repository root is the current Git workspace root.
- Never read, search, modify, or inspect files outside the current Git workspace root without explicit user authorization.
- Runtime code resolves filesystem paths with `path.resolve()`, `path.join()`, or `fileURLToPath(import.meta.url)`. Never commit workstation-specific absolute paths.
- Virtual namespaces (`/api/agent/stream`, `/workspace`, `/scratch`, `/artifacts`) are logical paths; do not convert them into OS-specific paths.

## Verification Lifecycle

Before completing a task or proposing a commit:

1. Stop any background dev or daemon processes started during the task.
2. Run targeted tests, then relevant test suites (`pnpm test`, `pnpm run test:runtime`, `pnpm --prefix frontend/web test`).
3. If tracked source or test files changed, regenerate and verify the manifest:
   ```powershell
   python app/scripts/generate_manifest.py
   python app/scripts/verify_manifest.py
   ```
4. Run full repository verification:
   ```powershell
   pnpm run verify
   ```
5. Run `git diff --check` and verify clean working tree.
6. Report exact test counts, HTTP status, and concrete payload verifications.
