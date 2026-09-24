# AGENTS.md — OneShot Project Guidelines

Standard instructions for AI coding agents working on OneShot. Follow the open [agents.md](https://agents.md) specification stewarded by the Agentic AI Foundation (Linux Foundation).

---

## 1. Core Operating Boundaries

- **Strict Workspace Confinement**: All work is strictly bounded to the workspace root: `d:\oneshot_e2e`. Never read, search, modify, or inspect files outside this directory (such as `C:\` or host-system directories).
- **Package Manager Standard**: Use `pnpm` exclusively across all scripts, installs, builds, and tests. Never use `npm` or `yarn`.
- **No Fake Progress or Hardcoded Mocks**: Never fabricate progress, fake timers, mock data, or synthetic success states. All UI states must reflect real backend SSE streams, records, and tool execution.
- **Response Verification Invariant (No Bare 'Passed')**: A test or stage transition that merely asserts or returns a superficial `pass` or `passed` status is strictly invalid. Progress is valid ONLY when the actual HTTP response payload, body fields, status codes, and byte/hash equality are inspected and asserted against expected data contracts.

---

## 2. Architecture & Module Map

| Area | Location | Responsibilities |
| :--- | :--- | :--- |
| **Canonical Frontend** | `frontend/web/` | Next.js App Router (`app/`), React components (`src/components/`), reactive hooks (`src/lib/`). Builds via static export to `frontend/web/dist/`. |
| **Browser Data & Streaming** | `frontend/web/src/lib/api.ts` | Real SSE client (`iterateAgentStream`), Action API v2 client (`OneShotPublicApi`), typed streaming hooks. |
| **Server Entry & Configuration** | `backend/index.ts`, `backend/environment.ts` | Node.js backend entrypoint, Express/HTTP routes, environment loader, SSE streaming endpoint (`/api/agent/stream`). |
| **Agent Operations & SOPs** | `backend/agents/`, `packages/agent-runtime/` | Researcher, Planner, Builder, and Refactor agents with their private tool bindings. |
| **Provider & Runtime Integration** | `backend/integration/`, `app/integration/` | Multi-provider routing (Gemini, OpenAI, Nebius, Ollama), capability probes, gateway fallbacks. |
| **Workspace Control Plane** | `app/workspace_api/` | FastAPI workspace control plane service (import root: `app`). |
| **Pipeline & Workflow Engine** | `backend/pipeline/`, `backend/workflow/` | Transition logic, stage workers, checkpoints, and human review gates. |
| **Deterministic Validation** | `backend/validation/python/validation/` | Python schema canonicalization, fixture validation, goal hashes, RPC service. |
| **Manifest & Integrity** | `app/scripts/` | `generate_manifest.py` and `verify_manifest.py`. |

### Legacy Notice
`app/web/` is retained only as a legacy/reference fallback UI. Do NOT add features or modifications to `app/web/`. All frontend work happens in `frontend/web/`.

---

## 3. Streaming & Event Standard (DeepAgents Architecture)

The frontend and backend follow the LangChain DeepAgents event streaming model:

1. **Native Stream Projections**:
   - `stream.messages`: Real-time text token deltas from the coordinator agent.
   - `stream.subagents`: Real-time lifecycle and message streams for delegated subagents.
   - `stream.tool_calls`: Real-time tool lifecycle:
     - `tool_use` (invocation started with parameters)
     - `tool_running` (tool actively executing)
     - `tool_result` (successful execution with payload)
     - `tool_error` (execution failure with error message)
2. **State-Driven Progress (`stream.values.todos`)**:
   - Progress is tracked via a real reactive `todos` list emitted from agent state (following `TodoListMiddleware` pattern: `pending` → `in_progress` → `completed`).
   - No hardcoded percentages, artificial progress bars, or synthetic step delays.
3. **Resilient Gateway Fallbacks**:
   - Provider failures automatically fall back across the provider chain without stalling or breaking the stream.

---

## 4. Development & Verification Commands

All commands run from repository root (`d:\oneshot_e2e`) using PowerShell:

| Task | Command | Description |
| :--- | :--- | :--- |
| **Launch Full Stack** | `./scripts/start-web.ps1` | Windows launch script (port 8787). Supports `-Rebuild`, `-Sample`, `-Port`. |
| **Bootstrap All** | `pnpm run oneshot` | Compiles backend, exports frontend, runs checks. |
| **Build Frontend** | `pnpm run build:ui` | Runs Next.js build & export to `frontend/web/dist/`. |
| **Build Backend** | `pnpm run build:backend` | Compiles TypeScript backend to `dist/`. |
| **Build All** | `pnpm run build` | Builds both backend and frontend. |
| **Frontend Dev Server** | `pnpm --prefix frontend/web run dev` | Runs Next.js local development server. |
| **Frontend Typecheck** | `pnpm --prefix frontend/web run typecheck` | Validates TypeScript contracts across `frontend/web`. |
| **Frontend Tests** | `pnpm --prefix frontend/web test` | Runs web test suite. |
| **Backend Tests** | `pnpm test` | Compiles and runs backend test suite. |
| **Runtime Tests** | `pnpm run test:runtime` | Runs agent runtime tests. |
| **System Verification** | `pnpm run verify` | Runs full 7-step repository verification suite. |
| **Regenerate Manifest**| `python app/scripts/generate_manifest.py` | Updates project manifest after builds. |
| **Verify Manifest** | `python app/scripts/verify_manifest.py` | Verifies repository manifest integrity. |

---

## 5. Dependency & Code Conventions

- **Strict ESM**: TypeScript modules use Node-compatible `.js` import specifiers.
- **Indentation**: 2 spaces for backend/cloud, 4 spaces for frontend/Python.
- **Line Endings**: LF-normalized.
- **Root Dependency Ownership**:
  - `@strands-agents/sdk`, `openai`, and `@modelcontextprotocol/sdk` must remain at the repository root.
  - `@tavily/core` is resolved through root for compiled output and pinned locally in `app/integration/tavily`.
  - `@ai-sdk/google` is owned by `app/integration/gemini` and must never become a root dependency.
  - `ai`, `ajv`, `bullmq`, and `ioredis` are backend runtime core and remain at the root.

---

## 6. Verification Lifecycle

Before completing any task or proposing commits:
1. Stop all background dev or daemon processes.
2. Run relevant unit and contract tests:
   ```powershell
   pnpm test
   pnpm --prefix frontend/web test
   ```
3. Regenerate and verify repository manifest if files were added or modified:
   ```powershell
   python app/scripts/generate_manifest.py
   python app/scripts/verify_manifest.py
   ```
4. Run full repository verification:
   ```powershell
   pnpm run verify
   ```
5. Report exact results, payload validations, and verification checks.
