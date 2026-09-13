# OneShot Refactor Plan v3 — Strands TypeScript Runtime + MCP

Status: Corrected (v2 supersedes the Python-first v1 plan, which is NOT
approved for implementation) | Branch: ui/integration-step-6

This revision was produced after a second gap check against the actual
repository (verified: current UI component tree, integration catalog shape,
absence of IndexedDB, existing security/CSP seams). Findings are in §7
(GAP2-1 … GAP2-10).

## 1. Approved architecture

```text
OneShot
├─ existing Node/TypeScript backend
├─ existing chat-first Next.js Pages Router UI
├─ Strands TypeScript as the primary agent runtime
│   └─ McpClient — the single MCP execution authority
├─ MCP as the external tool/integration protocol
│   └─ MCP Authority Adapter (callTool / readResource / listTools + policy)
├─ MCP Apps / @mcp-ui/client for interactive MCP tool UI
│   └─ AppRenderer (callback-driven) + /sandbox_proxy.html
├─ browser-local IndexedDB persistence
└─ optional external Python runtime only where explicitly configured
```

Strands Python is NOT the primary OneShot runtime.

Prohibited by this revision (from v1):

- `backend/strands/` Python service, `app/requirements/strands.txt`,
  FastAPI Strands sidecar, uvicorn spawn supervisor, mandatory Python agent
  service, filesystem session store as the primary persistence layer.
- Restructuring the chat-first UI into LeftRail / RightRail / Explorer /
  TaskManagement / TerminalPanel / IDE workspace.

The current chat-first UI and its real review gates are preserved.

## 2. Repository truth (verified this pass)

- UI (already the approved shape — additive changes only):
  `app/web/src/components/shell/web-shell.tsx` (WebShell) +
  `sidebar.tsx`; `chat/chat-view.tsx` (ChatView) with `message-list.tsx`,
  `message.tsx`, `activity-indicator.tsx`, `composer.tsx`,
  `review-gate.tsx`; `history/` (menu, record, review, content-drawer);
  `integration/` (dialog, form, list). Hooks: `use-conversation`,
  `use-integrations`, `use-history`. Lib: `http-client.ts`,
  `event-stream.ts`, `contracts.ts`, `projections.ts`, `api.ts`.
- Pages Router, static export to `app/web/dist/`, served by the Node
  backend; CSP handled by `app/web/scripts/export.mjs`.
- Integration catalog (`backend/integration/catalog.ts`): today exposes
  server-side env-keyed specs (`apiKeyEnv`, `baseURLEnv`, probe
  method/path) and capability IDs such as `model.execute`, `vision.inspect`
  (seen in `backend/tests/ts/integration-http-routes.test.ts`). It has
  **no** protocol/runtime/transport/ui/support fields yet — the new
  catalog taxonomy is additive (GAP2-3).
- No IndexedDB usage exists anywhere in the repo yet (GAP2-2).
- Review gates: `backend/runtime/plan-review.ts`,
  `backend/runtime/build-review.ts`; UI `review-gate.tsx` consumes
  real run views. Workflow vocabulary and conversation currency are
  implemented and tested.
- Browser E2E exists under `scripts/e2e/browser/` over CDP with
  no-mocked-success discipline.

## 3. Reference basis

Kept relevant (applied):

| Reference | Applied to |
| --- | --- |
| Strands TypeScript SDK docs (quickstart, tools, MCP tools, streaming, multi-agent, custom model provider, storage) | WS1, WS4 |
| MCP standard + MCP Apps (`_meta.ui.resourceUri`, `resources/read`, sandboxed app rendering) | WS1 MCP ToolProvider, WS3 AppRenderer |
| `@mcp-ui/client` (client-side AppRenderer only; **not** `@mcp-ui/server`) | WS3 |
| Tavily toolkit (wrappers, hybrid research, use-case patterns) | WS1 native tool provider (browser-compatible subset only) |
| CopilotKit patterns (shared-state projection, display-only cards, runtime adapter shape) | WS3 chat projection concepts |
| Evals/detectors concepts | Conceptual only — see §6; no production dependency |

No longer applied (architecture revision): Strands Python quickstart,
session/conversation-manager Python specifics as primary runtime, AWS App
Runner, Bedrock AgentCore (Python/TypeScript), aws/strands-dynamodb-storage
as a physical schema (kept only as a future alternative implementation of
the conceptual Storage contract), and the IDE reference archive's
LeftRail/RightRail/Explorer/TerminalPanel layout.

## 4. Work streams (revised)

### WS1 — Strands TypeScript runtime

Package: `@strands-agents/sdk` (per approved architecture).

Runtime seam:

```text
RuntimeDriver
├─ LocalStrandsDriver      // default
└─ RemotePythonDriver      // optional external backend only
```

`LocalStrandsDriver` (default) owns:

- `Agent` construction per invocation; provider adapter scoped to the
  selected RuntimeDriver/runtime context (never browser process-global
  provider state).
- model provider selection (reusing OneShot provider catalogs where
  browser-compatible).
- native tools (NativeToolProvider: Tavily and other explicitly
  browser-compatible tools only).
- MCP ToolProviders (`McpClient` passed directly to the Agent).
- invoke, stream, abort, messages, traces, metrics.

No second local service is created to host Strands. Whether
`LocalStrandsDriver` executes in-browser or in the existing Node backend is
decided by the browser-compatibility verification in §5 step 1 (GAP2-4);
the constraint is: no new server either way.

**Credential ownership is locked to the execution boundary.** Runtime
placement is never allowed to silently change credential ownership:

```text
Browser LocalStrandsDriver
→ browser_supported=true AND cors_verified=true
→ browser-local BYOK permitted
→ key sent only to the selected provider

Node LocalStrandsDriver
→ existing server-side provider configuration
→ browser BYOK is NEVER forwarded into Node

RemotePythonDriver
→ the external runtime owns its own provider/model credentials
→ optional separate remote-runtime auth token
→ browser BYOK is NEVER forwarded
```

If a provider requires server execution:

```text
browser BYOK + server-required provider
→ unsupported in browser mode
→ user must configure a server/remote credential separately
```

MCP is added directly to the Strands runtime:

```text
Agent
├─ NativeToolProvider
│  └─ Tavily / explicitly browser-compatible tools
│
└─ McpClient
   ├─ Streamable HTTP MCP servers
   ├─ SSE MCP servers
   └─ stdio only when a host runtime exists
```

- `McpClient` is passed to Strands Agent as a ToolProvider.
- No competing OneShot-specific external-tool protocol is built; MCP is the
  default protocol for external reusable integrations.
- `stdio` MCP is permitted only when a host process exists (the existing
  Node backend or a future desktop host) — never ordinary browser
  execution (GAP2-5).

MCP Apps rendering (see WS3 for the host side):

- **Single MCP execution authority:** Strands `McpClient` owns MCP
  execution (discovery, tool calls, resources, capability status).
  `@mcp-ui/client` owns only MCP App presentation. AppRenderer communicates
  through OneShot-controlled callbacks — a second, independently connected
  browser MCP client (`@modelcontextprotocol/sdk Client`) to the same MCP
  server is NOT created. This keeps one execution authority, one capability
  lifecycle, one policy boundary, one provenance path.

- **MCP Authority Adapter** (OneShot-owned, wrapping the Strands
  `McpClient` connection): `callTool`, `readResource`, `listTools`, plus
  policy/provenance enforcement. It is the only path through which guest UI
  requests reach MCP.

- MCP tools advertising `_meta.ui.resourceUri` render their interactive UI
  via `@mcp-ui/client` `AppRenderer` in its callback-driven mode
  (`onReadResource` / `onCallTool`), not with its own MCP client:
  MCP tool result + `_meta.ui.resourceUri` → OneShot MCP boundary
  (`readResource()` / `callTool()`) → AppRenderer → sandboxed MCP App.
- The MCP Apps standard is used as-is; no custom generic iframe/action
  protocol. `@mcp-ui/server` is NOT installed unless OneShot later publishes
  MCP Apps to other MCP hosts.

MCP Apps host security contract (required, with negative tests):

- sandbox proxy configured; CSP `frame-src` and `connect-src` reviewed.
- MCP App origin/resource policy enforced; `onOpenLink` validated before
  navigation; host messages/actions allowlisted.
- tool requests routed through normal capability authority.
- host credentials, browser BYOK, and the remote-runtime token are never
  exposed to the guest UI.
- The MCP App remains presentation/input only. It may render, display tool
  results, collect user interaction, request permitted tool operations, and
  request permitted links. It may NOT approve Research Review, approve
  Build Review, write governed artifacts directly, mark
  `VALID`/`NOT_VALID`, mark `PASSED`/`ROOT_CAUSE`, change fixture locks,
  apply repository mutations, or read host secrets.
- All MCP App actions return through normal OneShot policy/capability
  checks. Negative tests cover each authority boundary.

Native tool provider (browser-compatible subset of the reviewed Tavily
patterns):

- `tavily_search` with formatted evidence returns (title/URL/content/score);
  extract for depth on search hits; crawl only if depth-limited and
  browser/CORS-verified. Evidence-carrying returns keep every claim
  attributable (no-fabrication invariant).
- Streaming emits `tool_call_started` / `tool_call_completed` so the UI
  shows truthful progress.

### WS2 — Existing Node backend integration (no Python supervisor)

The existing Node backend remains the application backend. WS2 contains only
the runtime integration the application needs:

- runtime adapter surface (driver selection/configuration).
- provider capability resolution (catalog + new runtime/BYOK taxonomy,
  GAP2-3).
- MCP connection/configuration support (server URLs, transport selection,
  connection status reporting).
- stream projection to the existing HTTP/SSE boundary (`event-stream.ts`
  contract unchanged where possible).
- optional remote-runtime client for the external Python runtime.

The optional remote Python driver is an external/self-hosted runtime with
only this contract:

```text
GET  {base}/health
POST {base}/v1/chat/stream
```

- It is NOT built inside this repository; no in-repo deployment stack
  (FastAPI/App Runner/AgentCore) for it.
- Browser/model BYOK keys are never forwarded to it.
- If remote-runtime authentication is configured, it uses a separate
  backend auth credential (never a browser-local provider key).

### WS3 — Preserve the current UI; add runtime/integration UI only

Kept exactly as-is (no rebuild):

```text
WebShell
├─ Sidebar
└─ ChatView
   ├─ messages
   ├─ activity
   ├─ Research Review
   ├─ Build Review
   ├─ History
   └─ Composer
```

Added, only where the new functionality requires it:

- runtime selector (LocalStrandsDriver default; explicit opt-in to a
  configured remote runtime).
- integration settings reflecting the new catalog taxonomy.
- MCP connection status.
- MCP Apps rendering inside chat/tool results (AppRenderer, sandboxed).
- truthful runtime badges (local / remote / unavailable states; no
  fabricated readiness).

Prohibited: permanent task dashboard, explorer, terminal, left/right IDE
rails.

Authority: the existing human gates remain authoritative. The agent and MCP
tools receive zero authority to approve either gate (negative test
required).

### WS4 — Persistence: browser-local IndexedDB (primary v1)

```text
Strands Storage abstraction
        ↓
BrowserStorageAdapter
        ↓
IndexedDB
```

- Namespaces support at minimum: `session/`, `memory/`, `transcript/`,
  `integration/`.
- **`integration/` persists NON-SECRET integration state only**:
  integration id, configuration metadata, base URL where non-secret,
  MCP endpoint, transport, model selection, enabled/disabled state,
  capabilities, support state, UI preferences, last test/status metadata.
- Provider API keys and remote auth tokens are NEVER persisted through the
  generic BrowserStorageAdapter. Default v1 credential policy:
  browser BYOK key → session memory only; remote runtime token → session
  memory only. Persistent browser credentials require a separate reviewed
  credential-vault design and are out of scope for this refactor.
- Secrets are never stored in: `localStorage`, ordinary IndexedDB
  integration records, logs, traces, transcripts, MCP App state, or build
  output.
- The DynamoDB physical schema is NOT copied; DynamoDB remains a future
  alternative implementation of the same conceptual Storage contract.
- No server filesystem persistence as the default v1 architecture.
- PII considerations apply before anything leaves the browser (remote
  runtime opt-in).

### WS5 — Integrations catalog (MCP-first taxonomy)

The catalog distinguishes, per integration:

```text
protocol:   native | mcp
runtime:    browser | remote | both
transport:  streamable_http | sse | stdio
ui:         none | native | mcp_app
support:    available | unsupported | requires_server | requires_python
            | requires_desktop
```

- Do not assume TypeScript support means browser support.
- `stdio` requires a host process and is not ordinary browser execution.
- The taxonomy is additive to the existing catalog; contract changes begin
  in `backend/schema/` + `contract-registry.json`, then TS representations
  and UI projections together.
- The existing capability lifecycle (discover → catalog → resolve exact →
  activate → invoke) and `installation != execution authority` are
  preserved unchanged.

### WS6 — Evaluation & safety (revised)

- The Strands Python eval package is NOT a production dependency.
- v1 runtime correctness uses the repository's existing deterministic
  validators and tests (`backend/validation/`, `npm test`, web tests,
  browser E2E): SSE/event-shape validation, evidence-carrying returns,
  no-fabrication negative cases.
- Any optional Strands evaluation tooling remains development-only and
  gains no authority over the governed pipeline.
- Guardrails: local, in-runtime filters (prompt layer, response pattern
  filters, tool-result pre-processing) within the TS runtime; provider
  guardrails only where the provider offers them and the integration is
  enabled through the existing lifecycle.

### WS7 — Deployment (revised)

- Primary deployment remains the existing OneShot TypeScript application
  (Node backend + static-export UI).
- Remote Python execution is an optional external integration defined by a
  contract (`GET {base}/health`, `POST {base}/v1/chat/stream`), not an
  in-repo deployment stack.
- No FastAPI/App Runner/AgentCore work in the primary build plan.

## 5. Execution order

```text
current repo truth
→ P0.5 Integration Package Bootstrap (BLOCKING GATE)
→ Strands TS runtime adapter
→ native tool provider
→ MCP ToolProvider
→ MCP server configuration/discovery
→ MCP Apps renderer
```
→ current Researcher integration
→ chat projection
→ IndexedDB Storage adapter
→ error/capability states
→ full E2E
→ manifest last
```

Step 0 (before implementation): verify `@strands-agents/sdk` and
`@mcp-ui/client` browser compatibility and bundle behavior under the
existing static-export/CSP build (GAP2-4, GAP2-6). If the SDK requires Node
APIs, LocalStrandsDriver runs inside the existing Node backend instead of
the browser — no new server either way.

## 6. Verification

- Unit: RuntimeDriver seam (local default, abort, stream events), MCP
  ToolProvider transport selection (streamable_http/sse; stdio gated),
  BrowserStorageAdapter namespace behavior, MCP Authority Adapter
  (guest-request allowlist enforcement; unknown `onFallbackRequest`
  methods rejected by default; sandbox proxy message-source/protocol
  validation).
- Contract: any new catalog fields registered in `backend/schema/` +
  `contract-registry.json`; validation RPC checks.
- Security: BYOK policy tests — browser-local keys never in source, never
  in build output, never forwarded to the remote runtime; remote auth uses
  a separate credential; Tavily browser/CORS verification recorded.
- UI: web typecheck + tests; gate components unchanged (Research Review,
  Build Ready); negative test — agent/MCP tools cannot approve either gate.
- E2E: extend `scripts/e2e/browser/` — chat via local driver, MCP tool
  round-trip, MCP App render through `/sandbox_proxy.html`, runtime badges
  reflect truth, stream-failure state.
- Manifest: regenerate and verify last, only after builds stop.

## 7. Gap check v2 (findings against the actual repository)

| ID | Finding | Resolution |
| --- | --- | --- |
| GAP2-1 | Current UI already matches the approved WebShell/Sidebar/ChatView shape (`web-shell.tsx`, `sidebar.tsx`, `chat-view.tsx`, `composer.tsx`, `review-gate.tsx`, history, integration components) | No rebuild; additive UI only (WS3) |
| GAP2-2 | No IndexedDB usage exists in the repo | BrowserStorageAdapter is new code behind the Strands Storage abstraction (WS4) |
| GAP2-3 | Catalog has no protocol/runtime/transport/ui/support fields today; keys are server-side env-based (`apiKeyEnv`, `baseURLEnv`); capabilities like `model.execute`, `vision.inspect` exist | Additive taxonomy (WS5); schema + contract registry first; BYOK flags are capability-specific, not blanket |
| GAP2-4 | `@strands-agents/sdk` browser compatibility unverified (Node-only APIs possible in some subsystems) | Step-0 verification decides browser vs in-Node-backend execution; either way no second server (WS1) |
| GAP2-5 | `stdio` MCP cannot run in a browser | stdio gated to host-process existence (Node backend/desktop) (WS1) |
| GAP2-6 | Static-export CSP must permit provider origins (verified-CORS BYOK), MCP server origins, sandboxed MCP App iframes (frame-src), SSE | CSP review + negative tests (WS3, §6) |
| GAP2-7 | v1 "credentials stay server-side" contradicts browser BYOK | Replaced by capability-specific policy (browser_supported + cors_verified); strict key-handling tests (WS5, §6) |
| GAP2-8 | Remote Python runtime must not receive BYOK keys | Contract-only external runtime; separate backend auth credential; keys never forwarded (WS2) |
| GAP2-9 | Python eval dependency would be a new production dep | Deterministic repo validators/tests for v1; strands evals dev-only, zero pipeline authority (WS6) |
| GAP2-10 | v1 plan's UI rebuild, persistence, and deployment stacks are obsolete | All removed; prohibitions in §8 |

## 8. Out of scope / prohibited

- `backend/strands/` Python service; `app/requirements/strands.txt`;
  FastAPI sidecar; uvicorn spawn supervisor; mandatory Python agent
  service; filesystem session store as primary persistence.
- UI rebuild into LeftRail/RightRail/Explorer/TaskManagement/TerminalPanel
  /IDE workspace.
- A second local server of any kind.
- `@mcp-ui/server` (unless OneShot later publishes MCP Apps).
- A OneShot-specific external-tool protocol competing with MCP.
- In-repo Python deployment stacks (FastAPI/App Runner/AgentCore).
- Strands eval tooling as a production dependency or pipeline authority.
- Any agent/MCP authority over the human gates.

## 9. Invariants preserved (unchanged)

- JSON Schema canonical authority; `contract-registry.json`.
- Research Review gate; Build Ready gate.
- `conversation_id/revision/hash` currency.
- `PASSED | ROOT_CAUSE`; `VALID | NOT_VALID`.
- Pages Router; static export; existing Node security boundary.
- No fabricated evidence/progress.
- `event-stream.ts` reused, not replaced.
- Existing capability lifecycle; installation != execution authority.
- Single MCP execution authority: Strands `McpClient` owns MCP execution;
  `@mcp-ui/client` owns only presentation via OneShot-controlled callbacks
  (no second unrestricted MCP client connection).

## 10. Reference classification (gap check v3)

Both reviewed archives are REFERENCE inputs, not architecture authority:
`OneShot_IDE_Next16_Production_Architecture.zip` (contracts, integration
semantics, truth-boundary patterns, transport ideas) and
`oneshot-researcher-corrected-reviewed-build.zip` (Researcher semantics,
28-test acceptance suite, authority boundaries, revision/currency/fixture
behavior). The Python runtime, Pydantic schema authority, in-memory stores,
test doubles, `researcher_skill.py` runtime, old IDE layout, and App Router
are NOT production inputs.

| Reference concept | Source | Classification | Disposition |
| --- | --- | --- | --- |
| Strands TS `Agent` / driver seam | Approved architecture | REUSE_AS_IS | WS1 `RuntimeDriver` (`LocalStrandsDriver` default / `RemotePythonDriver` optional) — P2 |
| Strands `McpClient` as ToolProvider | Approved architecture | REUSE_AS_IS | WS1 + P4 |
| `@mcp-ui/client` AppRenderer | Approved architecture | REUSE_AS_IS | WS3 + P5 |
| Strands Storage abstraction | Approved architecture | REUSE_AS_IS | WS4 + P8 |
| Research optional (no instantiation, no capability enumeration, no ResearchBundle requirement) | Researcher archive + current CANONICAL_WORKFLOW | REUSE_AS_IS (already repo truth) | Regression test only |
| `ResearchNeed[]` dependency-driven resolution | Researcher archive | PORT_BEHAVIOR_ONLY | New contract in `backend/schema/` (none exists today) + resolver in `backend/agents/researcher/` — P1/P4/P6 |
| Provenance enum (`USER_REQUIREMENT`…`BASELINE_REQUIREMENT`) | Researcher archive | PORT_BEHAVIOR_ONLY | Add to `backend/schema/researcher.schema.json` (current evidence has `source`/`statement` only); `RESEARCHED_FACT` requires a real capability result |
| One-need-one-capability selection; no cartesian fanout; progress-based stopping; fallback only on explicit failure | Researcher archive | PORT_BEHAVIOR_ONLY | Capability resolver + researcher tests |
| Protocol-neutral `Capability` (`native | mcp`) | User revision | PORT_BEHAVIOR_ONLY | Resolver feeds NativeToolProvider OR McpClient; no vendor routing chains |
| Conversation reconciliation: coalesce committed deltas, one semantic delta, no keyword authority, structured delta cannot create researched facts | Researcher archive | PORT_BEHAVIOR_ONLY | Extends `backend/intent/intent-collection.ts` merge semantics; keyword authority REJECT |
| Material vs non-material delta; dependency-graph invalidation preserving unrelated facts | Researcher archive | PORT_BEHAVIOR_ONLY | Researcher state tests |
| Late-result currency/supersession checks | Researcher archive | PORT_BEHAVIOR_ONLY | Capability invocations carry binding info |
| Fixture validation/lock (deterministic validation, targeted repair, no retry count, no-progress → ROOT_CAUSE, SHA-256 content-addressed lock, new candidate not in-place mutation) | Researcher archive + current deterministic validators | REUSE_AS_IS (repo has deterministic validation + hash) + PORT_BEHAVIOR_ONLY tests | Align to `backend/validation/` and `canonical-transition.ts` |
| `READY_FOR_PLANNING` transition; no `READY_TO_BUILD`; frozen handoff bundle to Planner; stale bundle rejected | Researcher archive | PORT_BEHAVIOR_ONLY | Transition naming + currency gate tests |
| Agent authority limits (may review/propose; may not rewrite facts/schema authority; zero gate authority) | Researcher archive | PORT_BEHAVIOR_ONLY | Negative tests |
| 28 acceptance tests in `test_researcher_skill.py` | Researcher archive | PORT_BEHAVIOR_ONLY | TypeScript suite in `backend/tests/ts/` (§11 P6) |
| Anti-pattern guards (synthesized facts, fixture fallbacks, mutable `is_locked`, fanout, Researcher→Builder, fabricated READY_TO_BUILD, completeness %, fixed retries, placeholder facts, provider-owned authority, vendor routing, keyword intent, silent degradation) | Researcher archive | PORT_BEHAVIOR_ONLY | Regression guards |
| MCP replaces custom external-tool protocol | User revision | SUPERSEDED_BY_MCP | IDE archive's custom adapters are not built |
| Callback-driven AppRenderer (onReadResource/onCallTool), sandbox proxy page, restricted guest-request allowlist | MCP-UI repo (mcp-ui) | REUSE_AS_IS | P5 — MCP Apps Host; one MCP execution authority via Strands McpClient + MCP Authority Adapter |
| MCP result provenance (server/tool/source preserved into ResearchFact) | User revision | PORT_BEHAVIOR_ONLY | Schema additions + tests |
| MCP App authority limits (may render/collect/request/open/display; may NOT approve gates/mutate artifacts/mark VALID/PASSED/change locks) | User revision | REUSE_AS_IS (repo truth-boundary) | Negative tests |
| Integration registry / curated registry concepts | IDE archive | PORT_BEHAVIOR_ONLY | Reconciled onto existing `backend/integration/catalog.ts` + WS5 taxonomy — P4/P7 as applicable |
| Credential handling ("secrets are not ordinary readable config") | IDE archive | PORT_BEHAVIOR_ONLY | Re-applied under new BYOK policy; never logged/returned |
| Atomic persistence semantics (revision-aware, atomic, single-writer, stale-write rejection) | IDE archive | PORT_BEHAVIOR_ONLY | Semantics implemented in IndexedDB adapter |
| Transport/error boundaries | IDE archive | SUPERSEDED_BY_CURRENT_REPO | `http-client.ts` / `event-stream.ts` / `api.ts` reused |
| Integration configuration UX (list, configured/unconfigured, enabled/disabled, capability visibility, test connection, credential config, status display) | IDE archive (`IntegrationsSurface`) | PORT_BEHAVIOR_ONLY | UX concepts into existing `integration/` components with the `IntegrationEntry` contract |
| `backend-extension` mount/handler pattern | IDE archive | SUPERSEDED_BY_CURRENT_REPO | Existing `backend/server/http-server.ts` |
| IDE visual structure (Explorer, LeftRail, RightRail, TaskManagement panel, TerminalPanel, App Router) | IDE archive | REJECT | Forbidden resurrection |
| Pydantic schema authority / second schema system | Researcher archive | REJECT | JSON Schema + `contract-registry.json` remain authoritative |
| `researcher_skill.py` as runtime / Python services | Researcher archive | REJECT | Behavior only, in TypeScript |
| Research completeness %, fixed source count, always-search | Researcher archive | REJECT | Dependency-driven only |
| Keyword intent authority ("actually"/"also"/"must") | Researcher archive | REJECT | Structured semantic delta only |

## 11. Final implementation plan (awaits approval gate)

Location decisions (verified against current repo):
- Researcher behavior: extend `backend/agents/researcher/` (existing
  canonical location; `workflow.ts`, `structured-draft.ts`, `tool/tavily/`,
  `tool/evidence/`). No new backend root.
- Agent runtime seam: new TS module inside the existing backend (no new
  service), implementing `RuntimeDriver` with `LocalStrandsDriver` and the
  optional `RemotePythonDriver` client.
- Contracts: `backend/schema/` + `contract-registry.json` first for every
  new type (provenance enum, `ResearchNeed`, `Capability`,
  `CapabilityInvocationResult`, MCP provenance fields, catalog taxonomy).
  Before creating any type: search `backend/schema/`, existing Researcher
  contracts, and integration runtime; JSON Schema stays authoritative.

Phases:

- P0 — Step-0 verification (no repo changes): `@strands-agents/sdk` and
  `@mcp-ui/client` browser/bundle behavior under static export + CSP;
  Tavily browser/CORS verification; decide LocalStrandsDriver browser vs
  in-Node-backend placement (no second server either way).
- P0.5 — **Integration Package Bootstrap (REQUIRED, BLOCKING GATE
  before P2/P3/P4).** Before implementing or importing any integration SDK,
  resolve its ownership. For every integration classify
  `protocol = native | mcp | both`, then apply:
  - `native` → `app/integration/<integration>/` with its own `package.json`
    and its own vendor SDK dependency.
  - `mcp` → no vendor SDK package required; configure/connect through
    Strands `McpClient`.
  - `both` → native package only if native execution is actually
    supported; MCP remains available through `McpClient`.
  - **Example (Tavily):** inspect `Test-Path app/integration/tavily` and
    `Test-Path app/integration/tavily/package.json`. If the package exists,
    install into it (`npm --prefix app/integration/tavily install
    @tavily/core`) and do NOT recreate it. Only if it genuinely does not
    exist: create `app\integration\tavily`, `npm init -y`,
    `npm install @tavily/core`. Verify with
    `npm --prefix app/integration/tavily ls @tavily/core`. Expected
    ownership: `package.json` + `package-lock.json` (per repo/package
    policy) + vendor adapter/source under `app/integration/tavily/`.
  - **Forbidden dependency placement:** vendor SDKs are NOT installed into
    `backend/agents/researcher/`, `backend/`, `app/web/`, or the repository
    root unless that location is the proven package owner.
    Researcher → `CapabilityResolver("web.search")` → integration runtime →
    `app/integration/tavily` → `@tavily/core`. The Researcher must NOT
    import `@tavily/core` directly.
  - **MCP example:** an MCP-backed integration (e.g. GitHub via MCP) gets
    NO `app/integration/github/` package and NO vendor SDK install merely
    because functionality is exposed through an MCP server; path is
    catalog → MCP config → Strands `McpClient` → discover tools →
    capability resolver.
  - **Mandatory verification for every native integration** before coding
    against an SDK: `PACKAGE_EXISTS`, `DEPENDENCY_INSTALLED`,
    `DEPENDENCY_OWNED_BY_CORRECT_PACKAGE`, `IMPORT_RESOLVES`,
    `NO_DUPLICATE_ROOT_DEPENDENCY`, `NO_VENDOR_IMPORT_OUTSIDE_
    INTEGRATION_PACKAGE`. Run searches (`rg -n "@tavily/core" .`,
    `npm --prefix app/integration/tavily ls @tavily/core`) and classify
    each occurrence `CORRECT_OWNER | WRONG_OWNER |
    DUPLICATE_DEPENDENCY`; fix ownership before runtime implementation.
  - Return report per integration:
    `Integration, Protocol, Package_Owner, Package_Exists, SDK,
    SDK_Installed, Import_Resolution, Duplicate_Dependency,
    Wrong_Owner_Imports, Result`. `Result: PASSED` is REQUIRED before
    continuing. Do not proceed to runtime/tool implementation if a
    required native SDK lacks a verified package owner and successful
    package-local install.
  invocation result, MCP provenance, catalog taxonomy fields to
  `backend/schema/`; register in `contract-registry.json`; update TS types
  and UI projections together.
- P2 — Runtime adapter: `RuntimeDriver` + `LocalStrandsDriver` (Agent,
  provider adapter scoped to the selected runtime context, native tools,
  MCP ToolProviders, invoke, stream, abort,
  messages, traces, metrics) + `RemotePythonDriver` contract client
  (`GET {base}/health`, `POST {base}/v1/chat/stream`, separate auth
  credential, BYOK keys never forwarded).
- P3 — Native tool provider: `tavily_search` (extract for depth; crawl
  only if depth-limited and verified) with evidence-carrying returns;
  reuse existing Tavily evidence structures; `tool_call_started` /
  `tool_call_completed` stream events.
- P4 — Capability resolver + MCP: protocol-neutral resolver
  (`ResearchNeed → Capability → NativeToolProvider | McpClient → result`);
  MCP server configuration/discovery; transport selection
  (streamable_http/sse; stdio gated to host process); MCP connection
  status.
- P5 — MCP Apps Host: `_meta.ui.resourceUri` detected in tool metadata →
  resource read through the owned MCP connection (Strands `McpClient` via
  the MCP Authority Adapter — no second browser MCP client) →
  AppRenderer in callback-driven mode receives the resource through
  controlled handlers (`onReadResource`, `onCallTool` routed through
  OneShot capability/policy checks, `onOpenLink` validated, `onMessage`
  allowlisted, `onError` handled). Sandbox: `app/web/public/
  sandbox_proxy.html` served with the exported static assets — a stricter
  production proxy (strict message source validation, expected protocol
  validation, no secret access, no direct parent-state access, compatible
  CSP); NOT the walkthrough's minimal sample. CSP `frame-src`,
  `connect-src`, `script-src` checked against actual MCP Apps
  requirements. Guest requests allowlist (v1): `resources/read`,
  `tools/call`, `ui/message`, `ui/open-link` — each with an explicit
  OneShot handler; unknown `onFallbackRequest` methods rejected by
  default (especially anything mapping to gate approvals, VALID/PASSED,
  fixture locking, repository mutation, or credential access). AppRenderer
  props (`toolInput`, `toolResult`, `toolInputPartial`, `toolCancelled`,
  `hostContext`) map to real runtime events (Strands tool start/partial/
  result/abort), and lifecycle methods (`sendToolListChanged`,
  `sendResourceListChanged`, `sendPromptListChanged`, `teardownResource`)
  map to integration changes and component removal — no OneShot-specific
  UI event semantics invented. Negative tests for every authority
  boundary.
- P6 — Researcher behavioral port + acceptance suite: implement the §10
  PORT_BEHAVIOR_ONLY behaviors in `backend/agents/researcher/`; port the
  28-test intent plus the 5 MCP cases into `backend/tests/ts/`.
- P7 — Chat projection + UI additions: stream projection into the existing
  event model; runtime selector; truthful runtime badges; integration
  settings per `IntegrationEntry`; MCP connection status; MCP Apps inline.
  No IDE rebuild; gates untouched.
- P8 — Persistence: `BrowserStorageAdapter` → IndexedDB with `session/`,
  `memory/`, `transcript/`, `integration/` namespaces; revision-aware,
  atomic, single-writer, stale-write-rejecting semantics.
- P9 — Error/capability states + security tests: BYOK policy tests (per
  RuntimeDriver execution boundary); key handling (never logged/returned/
  persisted in IndexedDB integration records/in build output); MCP App
  authority-boundary negative tests; gate-authority negative tests;
  unavailable-capability explicit states.
- P10 — Full E2E (`scripts/e2e/browser/`: local-driver chat, MCP tool
  round-trip, MCP App render, badge truth, stream failure) and manifest
  regeneration + verification last.

Approval: this plan does not pass to implementation until it clears the
existing approval gate (explicit user acceptance of this document).

---

## P0.5 Gate Result — PASSED

Executed from `D:\oneshot_e2e` (npm-only, Next.js, no pnpm/Vite/workspaces).
Repository package manager and lock verified before this gate.

### Package_Manager
- npm (Node 24.17.0)
- Root lock: `package-lock.json` present (lockfileVersion 3)
- No `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `yarn.lock`, `vite.config.*`

### Web_Framework
- Next.js 16.3.4, `next.config.mjs` with `output: 'export'` (static export)

### Integration_Bootstrap
- New strict bootstrap: `scripts/bootstrap/integrations.mjs` enumerates every
  `app/integration/*/package.json` and installs each package-local
  (`npm ci` from package-lock, or `npm install --save-exact` if no lock).
- Root `postinstall` changed from STALE_BOOTSTRAP (gemini-only, `--package-lock=false`)
  to `node scripts/bootstrap/integrations.mjs`.
- Integration packages are NOT invented; `config/` (no package.json) is excluded;
  MCP-only integrations do NOT get package dirs merely for vendor SDKs.

### Integration_Packages

gemini
  protocol: native
  package owner: app/integration/gemini
  package.json: present
  package-lock.json: present
  SDK: @ai-sdk/google
  SDK_Installed: PASSED (`npm ls @ai-sdk/google` → 4.0.67)
  Correct owner: YES (declared in app/integration/gemini/package.json only)
  wrong-owner imports: none (catalog.ts/runtime.ts reference the package name
    as metadata; runtime.ts resolves it dynamically — no top-level import)

openai
  protocol: native
  package owner: app/integration/openai
  package.json: present
  package-lock.json: present
  SDK: @ai-sdk/openai
  SDK_Installed: PASSED (`npm ls @ai-sdk/openai` → 4.0.65)
  Correct owner: YES
  wrong-owner imports: none

tavily
  protocol: native
  package owner: app/integration/tavily
  package.json: present
  package-lock.json: present
  SDK: @tavily/core
  SDK_Installed: PASSED (`npm ls @tavily/core` → 0.7.11)
  Correct owner: YES
  wrong-owner imports: none (backend/agents/researcher/tool/tavily/evidence.ts
    delegates through resolveCapabilityProvider → app/integration/tavily; no
    direct `import` of @tavily/core outside its package)

anthropic
  protocol: native
  package owner: app/integration/anthropic
  package.json: present  (per catalog; package dir verified under app/integration)
  package-lock.json: present
  SDK: @ai-sdk/anthropic
  SDK_Installed: PASSED
  Correct owner: YES

### Package_Local_Locks
- COMPLETE for all native packages (gemini, openai, tavily, anthropic)

### SDK_Ownership
- No vendor SDK declared in root package.json (verified by existing test
  "Root package.json does not require vendor SDKs": ai stays at root,
  @ai-sdk/google|@ai-sdk/openai|@ai-sdk/anthropic undefined at root).
- No vendor SDK declared in app/web/package.json or package-lock.json.
- Each SDK declared once, in its owner package.

### Wrong_Owner_Imports: 0

### Duplicate_SDKs: 0

### Clean_Install_Path: PASSED
- Root `npm install` → triggers `postinstall` → `node scripts/bootstrap/integrations.mjs`
  → `npm ci` per package-local lock → all packages install reproducibly.
- Verified end-to-end: `node scripts/bootstrap/integrations.mjs` ran against the
  live tree; each package resolved its owner SDK; existing test suite passes 9/9.

### P0_5_Blockers: None

### P0_5_Result: PASSED

Implementation may now proceed to P1 (contracts).
