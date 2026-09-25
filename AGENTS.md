# AGENTS.md — OneShot Project Guidelines

Standard instructions for AI coding agents working on OneShot. Follow the open [agents.md](https://agents.md) specification stewarded by the Agentic AI Foundation (Linux Foundation).

## Project Overview

OneShot is a real agentic software-engineering console. A user sends a prompt through the canonical frontend composer. The backend receives it through the real streaming API, executes agent/tool workflows, and emits SSE events. The UI renders actual messages, tool calls, results, errors, todos, and human-review gates from backend state.

Never fabricate progress, assistant responses, tool execution, research results, validation success, or human approval. Empty, loading, unavailable, and failed states must remain distinguishable.

## Prerequisites and Installation

- Node.js >= 24.21.0
- pnpm >= 11.27.1
- Python 3.12+ for Python validation services
- Git
- Docker only for services that explicitly require containers

```powershell
pnpm install --frozen-lockfile
```

Use pnpm exclusively. Never use npm, yarn, or `npx`; use `pnpm exec` for local binaries.

## Run Modes

```powershell
pnpm dev                                      # backend development
pnpm --prefix frontend/web run dev             # frontend development
pnpm run oneshot                              # full project launcher
pnpm run build                                # production build
pnpm --prefix frontend/web run build           # frontend static export
pnpm --prefix frontend/web run preview        # static frontend preview
pnpm run start                                # backend production server
pnpm exec playwright test                     # browser tests
```

## Code Style

- TypeScript strict mode.
- Single quotes, no semicolons.
- Prefer functional patterns.
- Use Node-compatible ESM import specifiers.
- Follow the existing backend/cloud 2-space and frontend/Python 4-space indentation conventions.
- Keep line endings consistent with the repository's existing tracked files.
---

## Workspace and Path Rules

- The repository root is the current Git workspace root.
- Documentation uses repository-relative paths with `/` separators.
- Runtime code resolves filesystem paths with `path.resolve()`, `path.join()`, `fileURLToPath(import.meta.url)`, or explicit CLI/environment values.
- Never commit machine-specific absolute paths or workstation directories.
- API routes and virtual namespaces such as `/api/agent/stream`, `/workspace`, `/scratch`, and `/artifacts` are logical paths; do not convert them into OS-specific paths.
- Machine-specific browser, URL, output, and artifact locations must be supplied through environment variables or CLI options.
- **Strict Workspace Confinement**: Never read, search, modify, or inspect files outside the current Git workspace root without explicit user authorization.

## Package Manager Standard

Use pnpm exclusively across scripts, installs, builds, and tests. Never use npm, yarn, or `npx`.

## No Fake Progress or Hardcoded Mocks

Never fabricate progress, fake timers, mock data, synthetic success, assistant responses, research results, tool execution, or validation success. UI states must reflect real backend SSE streams, records, and tool execution.

## Response Verification Invariant

A test or stage transition is not valid merely because it returns `pass` or `passed`. Verification must inspect the actual HTTP response payload, body fields, status codes, and byte/hash equality against the expected data contract.

## Canonical Sources

| Concern | Canonical location |
| :--- | :--- |
| Production frontend | `frontend/web/app/` and `frontend/web/src/` |
| Reference-only alternate frontend | `frontend/web/src/components/main-screen/` |
| Backend HTTP/SSE entry | `backend/index.ts` |
| Environment loading | `backend/environment.ts` |
| Agent runtime | `packages/agent-runtime/` |
| Workspace control plane | `app/workspace_api/` |
| Workflow engine | `backend/pipeline/` and `backend/workflow/` |
| Deterministic validation | `backend/validation/` and `app/validation/` |
| Manifest and integrity | `app/scripts/` |
| Root package manager config | `package.json` and `pnpm-workspace.yaml` |
| Root lockfile | `pnpm-lock.yaml` |
| CI and deployment | `.github/workflows/deploy.yml` |

`app/web/` is not present in the current tree and must not be recreated as a second production frontend. Alternate `main-screen/` files under `frontend/web/src/` are reference-only until migrated. Do not edit `node_modules/`, `.next/`, or generated `dist/` output.

## Path and Variable Naming

Use explicit, consistent names for local path variables:

- JavaScript/TypeScript: `moduleDir`, `repoRoot`, `outputFilePath`, `artifactDir`, `relativePath`, `absolutePath`.
- Python: `repository_root`, `relative_path`, `absolute_path`, `output_file_path`, `source_file_path`.
- Keep public API and CLI names stable: `rootDir`, `path`, `--root`, and manifest JSON keys are compatibility contracts.
- Distinguish URL paths, virtual backend namespaces, and filesystem paths in names and documentation.


- `frontend/web/` is the canonical frontend.
- `App.tsx` and `Composer.tsx` are the canonical chat runtime path.
- `main-screen/` and the invariant-oriented `useStream`/`useTool` contracts are reference-only until migrated; do not import them from production components.
- The composer must support Enter to send, Shift+Enter for newline, auto-grow from 44px to 160px, and internal scrolling above 160px.
- Composer growth must occur for typing, quick tools, and externally inserted citations.
- The composer must not cover the final conversation message.
- Mobile layout must not permanently reserve the desktop sidebar width.
- Every visible interactive-looking control must have real behavior and keyboard access.
- Loading, empty, error, unavailable, and success states must be distinct and recoverable.
- Long text, citations, tool output, and session titles must not create page-level horizontal overflow.

## Agent Operating Rules

1. Inspect existing implementation and repository instructions before editing.
2. Preserve unrelated working-tree changes; never reset or discard them without explicit approval.
3. Prefer the smallest compatible change and follow existing naming, formatting, and framework conventions.
4. Keep platform-specific values in environment variables or CLI options.
5. Do not silently swallow user-facing errors.
6. Add or update tests for changed behavior, especially browser behavior for layout, focus, and overflow.
7. Never claim completion without running relevant checks and inspecting concrete results.
8. Report exact test counts, HTTP status, payload fields, and byte/hash equality where applicable.
9. Do not commit generated build output or secrets.
10. Do not use destructive Git commands without explicit user approval.

## Streaming & Event Standard (DeepAgents Architecture)

The frontend and backend follow the DeepAgents event streaming model:

- `stream.messages` carries assistant text deltas.
- `stream.subagents` carries delegated-agent lifecycle and messages.
- `stream.tool_calls` carries `tool_use`, `tool_running`, `tool_result`, and `tool_error` events.
- `stream.values.todos` carries real `pending`, `in_progress`, and `completed` state.
- No hardcoded percentages, artificial progress bars, fake tool execution, or synthetic delays.
- Provider failures may use the configured gateway fallback chain, but the UI must expose the real resulting state.

## Development and Verification Commands

| Task | Command |
| :--- | :--- |
| Install dependencies | `pnpm install --frozen-lockfile` |
| Backend development | `pnpm dev` |
| Frontend development | `pnpm --prefix frontend/web run dev` |
| Full project launcher | `pnpm run oneshot` |
| Build all | `pnpm run build` |
| Build frontend | `pnpm --prefix frontend/web run build` |
| Build backend | `pnpm run build:backend` |
| Frontend typecheck | `pnpm --prefix frontend/web run typecheck` |
| Frontend tests | `pnpm --prefix frontend/web test` |
| Backend tests | `pnpm test` |
| Runtime tests | `pnpm run test:runtime` |
| Browser tests | `pnpm exec playwright test` |
| Full verification | `pnpm run verify` |
| Generate manifest | `python app/scripts/generate_manifest.py` |
| Verify manifest | `python app/scripts/verify_manifest.py` |
| Verify demo assets | `pnpm run verify:demo` |

## CI and Deployment

- Install pnpm before `actions/setup-node` when pnpm caching is enabled.
- The root `pnpm-lock.yaml` is the dependency cache key.
- Required native build scripts must be approved in `pnpm-workspace.yaml`.
- Workflows and helpers must not use npm, yarn, or `npx`.
- Frontend production output is `frontend/web/dist/`.
- Pages deployment requires the repository Pages site to use `build_type: workflow`.
- A local build is not deployment proof. Inspect workflow logs, deployment logs, live HTTP status, and live payload evidence.

## Verification Lifecycle

Before completing a task or proposing a commit:

1. Stop background dev or daemon processes started for the task.
2. Run targeted tests, then the relevant broader suites.
3. If tracked source or test files changed, regenerate and verify the manifest:
   ```powershell
   python app/scripts/generate_manifest.py
   python app/scripts/verify_manifest.py
   ```
4. Run full verification:
   ```powershell
   pnpm run verify
   ```
5. Run `git diff --check` and review the final file list.
6. Report exact results, payload validations, and known limitations.
