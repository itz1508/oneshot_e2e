# Strands Integration Mapping Discovery — OneShot Researcher Workflow

Status: discovery / research artifact (not yet Build Ready).
Sources: OneShot source tree (`backend/`) inspected directly; each reference inspected
via its README/index entry on 2026-09-13. Per-reference confidence labels below.
The `strandsagents.com/integrations` pages are client-rendered; their static fetch
returns only the integration index, so file-level detail for those four entries is
UNCONFIRMED pending a live render or repo inspection.

## 1. Immutable OneShot boundaries (grounded in source)

From `backend/workflow/graph.json` (workflow_id, v):
- Agents: `Researcher → Planner → Refactor → GapAnalysis(→ GapCheck/GapFix/GapRecheck loop → GapAnalysisComplete) → Evaluation → TripleValidation(gate) → Confirmed(gate) → Hash → Builder → Finalize → Done`.
- Parallel group `TripleValidationParallel`: `SchemaValidation | FixtureValidation | GoalValidation`, joined at `TripleValidation`.
- Artifact ownership (excerpt): `Researcher` owns `Researcher(id)`, `plan_id`, `schema_id`, `fixture_id`, `goal_id`, `validation_id`; `Confirmed` owns `confirmed_package`; `Hash` owns `HASH`/`hash_proof`; `Builder` owns `build_result`, `execution_evidence`, `hash_sandbox`.
- `backend/workflow/canonical-transition.ts` encodes stage order and loop exits
  (gap-analysis iteration guard, confirmation gate, `finalize` terminal-only).
- Contract URNs: `urn:oneshot:schema:prompt:2` (required: `prompt_id, intent, requested_outcome, context, research_direction`), `urn:oneshot:schema:researcher:2`, `urn:oneshot:schema:plan:2`, `urn:oneshot:schema:confirmed-package:2` (required: `confirmed, core`).
- Invariants that must not be delegated to a third-party layer: hash/package-bound
  Build Ready authorization, confirmation gates, UI projecting real backend records,
  credentials server-side.

## 2. Per-reference mapping

Legend: **Adopt** = direct reuse as-is; **Adapt** = reusable pattern, needs rework;
**Inform** = pattern study only, no code reuse; **Reject** = conflicts with invariants.

### 2.1 cagataycali/strands-mcp-server — CONFIRMED (README)
- Type: bidirectional MCP bridge (agent-as-server `mcp_server` tool; agent-as-client `mcp_client` tool), HTTP/stdio/SSE transports, CLI (`uvx strands-mcp-server --cwd`), optional `invoke_agent` exposure.
- Mapping: boundary layer on the agent-tool edge. Fits OneShot's reusable-skill/tool boundary (`backend/skills/` callable bindings, `backend/tool/`), never the workflow itself.
- Conflicts: `expose_agent=True` (full agent invocation over MCP) and `stateless` mode both violate the gates/authorization invariants if wired to a gated stage. Any adoption must expose only curated tools and keep `stateless=False`.
- Classification: **Adapt** (client side for tool access; never expose the whole agent).
- Gaps: no authn model documented; port/process lifecycle unclear; UNCONFIRMED: server-side session handling beyond transport.

### 2.2 lekhnath/strands-redis-session-manager — CONFIRMED (README)
- Type: Strands `session_manager` plugin; persists conversation history/state in Redis; `RedisSessionManager(session_id, redis_client, ttl_seconds)`; Python 3.12+, Strands ≥1.16; fakeredis-based tests.
- Mapping: maps onto OneShot conversation/session persistence only — NOT run state. OneShot run state lives in `backend/runtime/` (run repository, event bus, artifact store) and is not a Strands session concept.
- Conflicts: TTL-based expiry is incompatible with OneShot's need for durable, replayable run evidence; a session manager cannot own workflow transitions.
- Classification: **Inform**; candidate **Adapt** only if a durable non-TTL store for agent transcripts is ever needed. Overlaps with repo's existing Redis/BullMQ infra (`backend/runtime/redis-connection.ts`) — do not add a second Redis client layer without a stated need.
- Gaps: key layout/schema UNCONFIRMED; multi-run isolation UNCONFIRMED.

### 2.3 macuartin/strands-postgresql-session-manager — CONFIRMED (README)
- Type: PostgreSQL/JSONB session manager on Strands' repository-based session API; tables `sessions → agents → messages / multi_agents` with CASCADE deletes; full CRUD incl. `read/update_multi_agent` for Graph/Swarm state; alembic migrations.
- Mapping: as 2.2 — durable (ACID, non-TTL) version of the same conversation-persistence boundary. The `multi_agents` Graph/Swarm persistence is the closest analog to OneShot's agent-graph state, but OneShot's graph state is already owned by `backend/runtime/run-repository.ts` and is authoritative.
- Conflicts: adopting it as the source of truth would fork run state from `backend/runtime/`. Record-level schema (JSONB blobs) is not contract-validated against `backend/schema/`.
- Classification: **Inform** — pattern reference for durable session tables; **Adapt** only as a storage backend behind an OneShot-owned repository interface, never replacing `run-repository.ts`.
- Gaps: tested with Strands 1.55.1 / PostgreSQL 14+; behavior against OneShot's Python runtime version UNCONFIRMED.

### 2.4 future-agi/traceAI — CONFIRMED (README + integrations index)
- Type: OpenTelemetry GenAI instrumentation framework, multi-language (Python/TS/Java/C#); per-framework instrumentors; captures prompts/completions, tokens, tool calls, streaming chunks, errors, timing per OTel GenAI semantic conventions; exports to any OTel backend.
- The strandsagents.com index lists `traceai` specifically as OpenTelemetry instrumentation for the **Strands Agents TypeScript SDK**.
- Mapping: observability on top of stage execution — complements, never replaces, OneShot's `backend/runtime/event-bus.ts` and `processing-event.schema.json`. Two distinct record streams: OTel spans (diagnostics) vs OneShot events (authoritative workflow evidence).
- Conflicts: spans are not workflow evidence; they must not appear in the UI as progress (fabricated-progress invariant). Do not let trace export become a dependency of stage completion.
- Classification: **Adapt** (add an instrumentor as a diagnostics side-channel; keep event bus authoritative).
- Gaps: Strands-specific instrumentor coverage and Python-SDK support UNCONFIRMED; exporters need server-side credentials (aligns with credentials-server-side invariant).

### 2.5 JackXu0/strands-swarms — CONFIRMED (README)
- Type: `DynamicSwarm(available_tools, available_models).execute(query)` — LLM plans a workflow, spawns sub-agents, resolves dependencies; rollout-only (string-in/string-out); `stream_async()` trajectory streaming; RL support planned.
- Mapping: competing orchestration layer. OneShot's orchestration is fixed and canonical (`graph.json` + `canonical-transition.ts`); dynamic swarm planning directly opposes the canonical workflow order and gates.
- Conflicts: dynamic agent creation/dependency resolution would replace the Researcher→Planner→…→Builder order and bypass confirmation/hash gates. Explicitly out of bounds.
- Classification: **Reject** for orchestration. Its spawned-sub-agent pattern may **Inform** internal tool fan-out only where no gate exists (the `TripleValidationParallel` group already covers this natively).
- Gaps: none material — rejected by invariant, not by evidence.

### 2.6 strands-compose/bedrock-agentcore — CONFIRMED (README)
- Type: deployment adapter wrapping a YAML-described strands-compose agent system as the ASGI app Bedrock AgentCore Runtime expects; per-session isolation, auto-scaling; `sca dev` runs the same ASGI app locally as in production; per-session SSE event queues; CodeZip/container deploy paths; CDK support.
- Mapping: a future deployment/hosting path for a Python runtime hosting the Researcher (or the whole canonical workflow). Preserves local/production parity (`sca dev` = production app) — matches OneShot's deterministic-launch invariant.
- Conflicts: would relocate stage execution out of the Node backend; pipeline stages, queues, and review gates (`backend/pipeline/`, `backend/runtime/plan-review.ts`, `build-review.ts`) remain server-side owners. AgentCore session isolation must not replace OneShot run identity (`run_id`/stage scope).
- Classification: **Inform** now; potential **Adapt** only when a managed-hosting phase is planned. Deployment boundary, not a workflow or state boundary.
- Gaps: cost/limits, VPC requirements, and AgentCore-session→OneShot-`run_id` correlation UNCONFIRMED; community project (not AWS).

### 2.7 ryancormack/strands-acp — CONFIRMED (README, incl. Known gaps)
- Type: TypeScript bridge exposing a Strands agent over the Agent Client Protocol (JSON-RPC, stdio transport default); `createStdioServer(createAgent)`; session lifecycle (create/list/resume/close), prompt streaming, tool-call events, cancellation; optional `sessionStore` for durable session metadata.
- Mapping: an alternative *client* protocol in front of the Researcher agent — protocol-level counterpart to 2.1, not a tool-level one.
- Conflicts: its documented gaps are hard constraints if adopted: `authenticate` fails open (violates server-side credential/auth rules), `setSessionMode` silently no-ops, `listSessions` needs a `sessionStore` to survive restarts, `loadSession`/`resumeSession` are asymmetric with restamped timestamps. Session identity must map to OneShot `run_id`, not bridge-internal state.
- Classification: **Inform**; **Adapt** only with an auth layer in front and an OneShot-owned `sessionStore`.
- Gaps: per README, session enumeration needs an upstream SDK API — cannot be fixed in the bridge.

### 2.8 strandsagents.com — strands-valkey-session-manager — PARTIALLY CONFIRMED (index entry only)
- Index entry: "Valkey/Redis-backed session manager persisting conversation history with low latency on ElastiCache and Upstash."
- Mapping: same boundary as 2.2 with Valkey/ElastiCache/Upstash backends. OneShot already ships local Redis (`npm run redis:up`, `docker/docker-compose.dev.yml`), so this would target the same infra for *conversation* persistence only.
- Conflicts: identical to 2.2 — must not own run state or transitions.
- Classification: **Inform**.
- Gaps: UNCONFIRMED — operations, schema, TTL semantics, file names (SPA page; requires repo inspection before any adoption decision).

### 2.9 strandsagents.com — http-request — PARTIALLY CONFIRMED (index entry only)
- Index entry: among the 35 listed tools; exact tool schema, auth, timeout/retry UNCONFIRMED.
- Mapping: generic outbound HTTP tool for the Researcher's evidence collection (`backend/agents/researcher/tool/` collector). Today the collector gathers repo/prompt evidence; an HTTP tool would extend it.
- Conflicts: egress must stay inside the workspace-path/credential policy and sandbox admission checks; SSRF/egress allowlisting is OneShot's concern, not the tool's. Evidence must land as structured `evidence` records (`urn:oneshot:schema:researcher:2`), not free text.
- Classification: **Adapt** (wrap behind the existing evidence collector with an egress policy) — pending schema confirmation.
- Gaps: UNCONFIRMED — request/response shape, auth header handling, retries.

### 2.10 strandsagents.com — Amazon Bedrock — PARTIALLY CONFIRMED (index entry only)
- Index entry: built-in model provider ("Run Strands agents on Amazon Bedrock models…", category: Model Providers, 28 total). Provider class/config, streaming, guardrails, context management UNCONFIRMED.
- Mapping: model provider behind the Researcher's model-capability resolution. `backend/agents/researcher/workflow.ts` already abstracts this (capability object/function/`generateText` model, plus `resolveActiveIntegrationModel` from `backend/integration/`); a Bedrock provider slots in as a new source of `activeModel`.
- Conflicts: model provenance is already recorded (`modelSource`/`modelProvenance`) — any provider must flow through that provenance chain. Credentials must resolve server-side (`backend/environment.ts`), never browser-side.
- Classification: **Adapt** (implement as an integration model source behind the existing resolution path).
- Gaps: UNCONFIRMED — exact provider config surface; need model-provider docs or SDK source.

### 2.11 strandsagents.com — AG-UI — PARTIALLY CONFIRMED (index entry only)
- Index entry: "Connect agents to rich clients like CopilotKit through the AG-UI protocol, with streaming chat and tool-based generative UI." (Partner, Python.)
- Mapping: presentation/streaming boundary between backend and browser UI. OneShot's UI consumes its own SSE/event projection (`app/web/lib/api.ts`); AG-UI would be a second, protocol-different channel.
- Conflicts: AG-UI events are agent-conversation oriented; they cannot carry or replace OneShot's canonical workflow events (`processing-event.schema.json`) without a translation layer — and the UI must keep projecting real backend records. Risk of the UI displaying agent chatter as workflow progress.
- Classification: **Inform**; **Adapt** only if a chat-style Researcher UX is explicitly scoped, with a strict event-translation mapping and no authority over workflow state.
- Gaps: UNCONFIRMED — event types, state-sync mechanism, transport details (SPA page).

## 3. Cross-cutting findings

1. **Two storage layers must not be conflated.** Session managers (2.2, 2.3, 2.8) persist *conversation* state; OneShot *run/workflow* state belongs to `backend/runtime/`. Any adoption is storage-behind-interface at most.
2. **Three references propose orchestration.** swarms (dynamic), ACP (client-driven), AG-UI (client-driven streaming) all implicitly move control of stage execution outside the canonical graph. All are rejected/adapted at the boundary; none may alter `graph.json` semantics or gates.
3. **Boundary tools are the low-risk adoption surface**: MCP client (2.1), HTTP tool (2.9), model provider (2.10) — all slot behind existing seams (`backend/skills/`, `backend/tool/`, researcher collector, `resolveActiveIntegrationModel`).
4. **Observability is additive only** (2.4): OTel spans supplement, never substitute, the event bus.
5. **Deployment (2.6)** is the only reference that could change runtime topology; it is deferred until a hosting phase exists and must preserve launch parity.

## 4. Open gaps / follow-ups

- Render the `strandsagents.com/integrations` entries (2.8–2.11) in a browser or fetch their underlying repos/SDK sources to close the PARTIALLY CONFIRMED items.
- If 2.2/2.3 are pursued: inspect their `src/` for key layout, serialization, and non-TTL options.
- If 2.4 is pursued: confirm a Strands (Python) instrumentor exists; define span↔event-id correlation policy.
- Runtime foundation verification (live pipeline run, event-bus proof) explicitly deferred — this document covers static mapping only, per scope.
