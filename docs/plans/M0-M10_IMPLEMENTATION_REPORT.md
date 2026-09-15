# M0–M10 Implementation Report (Checkpoint)

## 1. Status
M0–M10 accepted as an implementation checkpoint. A clean verification run was
recorded (Section 5). This report precedes M11 (Credentials and Protected
Provider Configuration). No commit was made; rollback is via patch + untracked
inventory (Section 9).

## 2. Files modified (tracked, 3)
- `backend/agents/researcher/workflow.ts` (+125): `executionRequirements()`,
  `runWithRuntime()`, `finalizeBundle()` (M3/M9). Intentional.
- `backend/agents/researcher/strands-tools.ts` (+15): `createToolsFromNeutral`
  + neutral-tool-converter re-export (M9). Intentional. (A trailing blank line
  at EOF was removed during this checkpoint for `git diff --check` hygiene.)
- `backend/tests/ts/tavily-researcher-live.test.ts` (+10/-3): live-test
  env-gating alignment.

## 3. Files added (untracked, 96 — full list in m0-m10-untracked-inventory.txt)
By area:
- `backend/integration/core/` (types, route, policy, capability) — M1
- `backend/integration/provider/` (registry, custom, presets/ollama|groq|openai) — M2
- `backend/integration/endpoint/` (registry, url-validator, redirect-validator,
  locality-detector, port-policy, metadata-blocklist, dns-checker, health-probe) — M2/M8
- `backend/integration/model/` (registry, discovery/openai-compatible-discovery) — M2/M5
- `backend/integration/capability/` (registry, probe, structured-output-probe, tool-use-probe) — M2/M6
- `backend/integration/runtime/` (types, fake-runtime, direct-openai-runtime,
  strands-adapter, strands-openai-model, registry) — M4/M9/M10
- `backend/integration/transport/` (http-request, openai-compatible-client) — M5
- `backend/integration/routing/` (router, eligibility/policy/capability/privacy
  filters, scorer, tie-breaker, runtime-compatibility) — M7
- `backend/integration/research/` (registry, tavily-adapter) — M2
- `backend/integration/mock/` (openai-compatible-mock-server) — M5
- `backend/agents/researcher/execution-requirements.ts` — M3
- `backend/agents/researcher/tool/neutral-tool-converter.ts` — M9
- `backend/tests/ts/*.test.ts` (38 new test files) + `router-harness.ts` — M1–M10
- `docs/plans/Pre_Refactor_Baseline.md`, `Pre_Refactor_Fix_Plan_v3.md`

## 4. Tests by classification
Total executed: **256 tests. 254 pass, 2 skipped (live-gated), 0 fail.**
- New M0–M10 tests: **130** (38 files)
  - M1 types: operational-types, capability-evidence, capability-evidence-states
  - M2 registries: provider-registry, endpoint-registry, model-registry, runtime-registry, research-registry
  - M3 requirements: execution-requirements, fake-runtime, fake-runtime-route
  - M4 neutrality: fake-runtime, researcher-fake-runtime
  - M5 mock transport: openai-compatible-mock, openai-compatible-discovery, custom-provider-mock-chat
  - M6 probes: structured-output-probe, tool-use-probe, capability-probe-mock
  - M7 routing: router-{capability,eligibility,end-to-end,policy,privacy,scoring,tie-break}, runtime-compatibility
  - M8 discovery: url-validator, redirect-validator, port-policy, locality-detector, health-probe-{mock,timeout}, endpoint-registry
  - M9 Strands bridge: strands-adapter, neutral-tool-converter, researcher-strands-{mock,ollama-compat,workflow}
  - M10 direct runtime: direct-openai-runtime, researcher-direct-runtime-mock
- Existing tracked regression: **124** tests (49 files), 0 fail. (The "18
  existing" figure in the prior report denoted a narrow pre-WIP baseline subset;
  the full tracked suite is green.)
- Live-gated (skipped without credentials): `researcher-strands-live`
  (ONESHOT_LIVE_TEST), `tavily-researcher-live` (RUN_LIVE_TAVILY_TESTS)

## 5. Commands executed
- `Remove-Item .\dist -Recurse -Force`
- `npm run build:backend` (`tsc -p tsconfig.json`) — success
- `npm run build:test` (`tsc -p tsconfig.test.json`) — success
- `npm run guard:layout` — pre-existing violations only (`.tmp-diag`,
  `__pycache__`; file warnings `AGENTS.md`/`INDEX.md`/`LICENSE`/`start-web.ps1`/`dev-server.log` are pre-existing, not from M0–M10)
- `git diff --check` — clean (after EOF trailing-blank-line fix in strands-tools.ts)
- `node --test --test-concurrency=1 --test-force-exit dist/backend/tests/ts/<batch>.test.js` (run in batches to avoid the emit race)

## 6. Known limitations
- The Strands **architectural** adapter is proven; the **live** Strands provider
  path is NOT yet proven (real `OpenAIModel` uses Undici). Tests use injectable
  factories (Section 11).
- The direct OpenAI-compatible runtime (M10) IS proven against a loopback mock.
- No live Groq, OpenAI, Ollama, or Tavily connectivity is proven. Live tests are
  env-flag-gated and skip in ordinary runs.
- Authentication was removed (commits 1128e427, 81155646): `ONESHOT_API_TOKEN`
  removed, loopback-bind guard removed, default bind host `127.0.0.1`→`0.0.0.0`,
  `Authorization` removed from CORS. OneShot currently has **no user
  authentication and binds publicly by default**. M11 addresses the credential
  boundary this creates.
- The route-snapshot persistence file (`backend/runtime/route-snapshots.ts`,
  referenced in the plan) does not yet exist on disk; route snapshots currently
  live in-memory in `RunRepository`.

## 7. Deferred work
M11 Credentials; M12 Research policy/Tavily; M13 Researcher HTTP slice; M14
Conversations/messages; M15 Streaming/cancellation/reconnection; M16 Ollama;
M17 Cloud presets; M18 Conversational web workspace; M19 Redis recovery/hardening.

## 8. Architectural decisions
- Provider-neutral operational contracts (`ProviderDefinition`,
  `EndpointDefinition`, `ModelCandidate`, `CapabilityEvidence`,
  `ResolvedExecutionRoute`, `RoutingPolicy`) — no vendor SDK types, no
  credentials.
- Registry-backed: provider/endpoint/model/capability/runtime/research
  registries with in-memory defaults; no file-backed override (Gap 13).
- `AgentRuntime` abstraction (M4): runtimes consume a non-secret
  `ResolvedExecutionRoute` + `RuntimeInvocation` and return a
  `NormalizedResult`; runtimes are downstream of routing and do not choose
  transitions.
- Deterministic routing (M7): eligibility→policy→capability→privacy→score→
  stable-tiebreak; same inputs always yield the same route (or same null +
  rejections).
- Privacy filtering (M7): cloud endpoints blocked in local-only mode;
  `private-network` not auto-trusted.
- Safe approved-endpoint discovery (M8): URL validation (http/https only),
  port policy (80/443/>=1024), metadata blocklist (SSRF), redirect
  re-validation, DNS rebinding guard, bounded timeouts, `agent:false` sockets.
- Provider-scoped model identity: two providers may share a `modelId` without
  collision (route always carries `providerId` + `endpointId`).
- Strands runtime migration bridge (M9): `StrandsAdapter` implements
  `AgentRuntime`; the Researcher describes tools via neutral
  `OneShotToolDefinition` converted to Strands `FunctionTool`. Strands stays
  behind an adapter.
- Direct OpenAI-compatible runtime (M10): consumes the same
  `ResolvedExecutionRoute`, invokes via the undici-free `node:http` transport.
- Existing Researcher behavior preserved: fake-runtime and test-draft-file
  paths retained; `runWithRuntime` is additive.

## 9. Rollback instructions
- Tracked changes: `git apply -R docs/plans/m0-m10-tracked.patch` (reverts
  `workflow.ts`, `strands-tools.ts`, `tavily-researcher-live.test.ts`).
- Untracked files: delete the 96 entries in
  `docs/plans/m0-m10-untracked-inventory.txt` (the `backend/integration/**`
  tree, `execution-requirements.ts`, `neutral-tool-converter.ts`, 38 test
  files, `router-harness.ts`, `Pre_Refactor_*.md`, and the two checkpoint
  artifacts). Scripted reference:
  `Get-Content docs/plans/m0-m10-untracked-inventory.txt | ForEach-Object { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }`
- No commit was made (per AGENTS.md: commit only when authorized). The patch
  + inventory preserve the checkpoint without a commit. A checkpoint branch
  was intentionally NOT relied upon — a branch alone does not preserve
  uncommitted work (correction #10).

## 10. Undici/libuv workaround
`backend/integration/transport/http-request.ts` uses Node's built-in
`node:http` / `node:https` modules (NOT global `fetch`/undici) with
`agent: false` — a fresh socket per request that closes after the response.
This avoids a Windows libuv `uv_async` / `UV_HANDLE_CLOSING` assertion that
fires when `node --test --force-exit` tears down undici's internal async
handle at process exit. This matches the codebase's existing HTTP test
pattern.

## 11. Injectable Strands factories
`StrandsAdapter` (`backend/integration/runtime/strands-adapter.ts`) accepts
optional `createAgent?` and `createModel?` factory functions. Ordinary tests
inject fakes implementing the `StrandsAgentRunner` / `OpenAIModel` shapes
without the real Strands SDK or network. This is required because the real
Strands `OpenAIModel` uses Undici (which would re-trigger the libuv issue and
make real network calls). Consequence: the Strands **architectural** adapter
(`AgentRuntime` conformance, route consumption, evidence recording,
`NormalizedResult` shape) is proven, but the **live** Strands provider path
(real `OpenAIModel` → real cloud) is NOT yet proven. The direct
OpenAI-compatible runtime (M10) provides the real-invocation proof via the
undici-free mock.

## 12. Confirmation: no external calls in ordinary tests
All ordinary (non-live) tests are external-call-free. Mock servers bind to
loopback (`127.0.0.1` ephemeral ports) only. Live provider tests
(`researcher-strands-live`, `tavily-researcher-live`) are env-flag-gated
(`ONESHOT_LIVE_TEST` / `RUN_LIVE_TAVILY_TESTS`) and SKIP when the flags are
unset, as confirmed in this checkpoint run (2 skipped). No live Groq,
OpenAI, Ollama, or Tavily connectivity is claimed.

## 13. Checkpoint artifacts
- `docs/plans/m0-m10-tracked.patch` (8714 bytes) — binary patch of the 3
  tracked modified files.
- `docs/plans/m0-m10-untracked-inventory.txt` (96 entries) — full list of
  untracked new files.
These are rollback artifacts, not release source artifacts; remove before
any release-facing manifest regeneration.

## 14. The "custom.ts" identity
The prior report's reference to "custom.ts" is `backend/integration/provider/
custom.ts` (untracked, new in M2). It explicitly notes "full
CredentialReference handling arrives in M11" and "Credentials are NOT stored
on the definitions (Gap 9)". It is NOT an accidental change; it is the M2
custom-provider descriptor carrying the M11 hook.

---

# M11 Addendum — Credentials and Protected Provider Configuration

## A1. Files added (backend/security/, 7 files)
- `credential-reference.ts` — `CredentialReference{credentialId, providerId,
  source, scope, ownerId?, envVarName?, secretStoreRef?}`, `CredentialSource`
  (`environment|session|secret-store|none`), `CredentialScope`
  (`process|principal|run`), `redactSecret()` → `"set"|"unset"`, `isNoneRef()`,
  `assertSameProvider()`, `CredentialError` with typed codes.
- `provider-env-mapping.ts` — explicit allowlist ONLY: built-ins
  `OPENAI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`; custom providers match
  `^ONESHOT_PROVIDER_KEY_[A-Z0-9_]+$`. No arbitrary `process.env[name]`
  lookup; a browser request can never choose an env-var name.
- `credential-resolver.ts` — `CredentialResolver` (a service); `resolve()`
  throws typed errors: `CREDENTIAL_RESOLVER_UNAVAILABLE` (fail-closed
  secret-store), `CREDENTIAL_NOT_FOUND`, `CREDENTIAL_DENIED`,
  `CREDENTIAL_INVALID_REFERENCE`, `CREDENTIAL_NOT_REQUIRED`. ONLY
  `source:"none"` resolves without error. `SessionCredentialStore` is
  in-memory, expiring (`ttlMs`), clearable, owned, loopback/flag/non-prod gated.
- `credential-policy.ts` — session storage requires loopback AND
  `ONESHOT_LOCAL_CREDENTIAL_SESSION=true` AND non-production (loopback is NOT
  authentication). Public-unauthed hard-disables credential submission, session
  storage, secret-reference creation, and mutation (fail closed).
- `header-allowlist.ts` — `HeaderNotAllowedError` (HEADER_NOT_ALLOWED) listing
  safe names only; case-insensitive; custom headers validated FIRST, then
  OneShot-managed auth headers added AFTER (never overridable). Blocks
  hop-by-hop, `Host`, `Cookie`/`Set-Cookie`, `Authorization`/`X-API-Key`,
  `Content-*`, `X-Forwarded-*`/`Forwarded`, and any `Proxy-*`.
- `deployment-posture.ts` — bind host, production mode,
  `ONESHOT_LOCAL_CREDENTIAL_SESSION`, auth presence.
- `authentication-context.ts` — explicit `AuthenticationContextProvider`
  interface + `UnauthenticatedContextProvider` implementation. NOT a stub auth
  boundary; M13 layers a real provider here without reshaping policy.

## A2. Files modified
- Tracked: `backend/environment.ts` (+13, credential policy config, no secret
  values read), `app/env/.env.example` (+18, documented policy + env
  conventions), `backend/server/http-server.ts` (+20, constructs
  `CredentialPolicy` + `UnauthenticatedContextProvider` at startup; soft
  general warning when public-unauthed; NO credential endpoints added — M13).
- Untracked (M0–M10 tree): `backend/integration/runtime/types.ts`
  (`RuntimeInvocation.credentialRef?` — per-invocation, correction #5),
  `backend/integration/runtime/direct-openai-runtime.ts` and
  `backend/integration/runtime/strands-adapter.ts` (own a
  `CredentialResolver` SERVICE, resolve `credentialRef` inside `invoke()`;
  never permanently bind a reference to a shared runtime instance),
  `backend/integration/transport/openai-compatible-client.ts` (headers
  validated via the allowlist before send), `backend/integration/provider/
  custom.ts` (carries `credentialRef` as non-secret metadata; cross-provider
  guard).

## A3. Legacy bridges (correction #8)
`apiKey` / `tavilyKey` remain ONLY for internal regression compatibility.
They: are NOT accepted from HTTP input (no public credential API exists in
M11; any inbound key is denied at the security layer); are DISABLED in
production (`DirectOpenAIRuntime` throws); never bypass redaction; are tested
as rejected via public APIs. Removal milestone: M13, after HTTP callers pass
equivalent tests through the `CredentialResolver` path.

## A4. M11 test results
New M11 tests: **50 pass, 0 fail** (8 files: credential-reference,
credential-resolver, credential-policy, header-allowlist, deployment-posture,
authentication-context, provider-env-mapping, credential-leakage).
Post-M11 totals: **180 new tests** (130 M0–M10 + 50 M11) **+ 124 tracked
regression = 304 pass, 2 live-gated skipped, 0 fail.**

## A5. M11 hard-gate results (correction #12)
- [x] No arbitrary environment access — allowlist-only; arbitrary names rejected.
- [x] Fail-closed secret-store — `CREDENTIAL_RESOLVER_UNAVAILABLE` when no backend.
- [x] Session expiry — `ttlMs` enforced; expired sessions rejected.
- [x] Provider ownership — cross-provider use rejected (`assertSameProvider`).
- [x] Case-insensitive header rejection — `HeaderNotAllowedError`, no silent drop.
- [x] No HTTP legacy-key injection — raw `apiKey` has no accepting public API.
- [x] Production bridge disabled — legacy `apiKey` throws in production.
- [x] No credential reference in `ResolvedExecutionRoute` — structurally absent.
- [x] No secret in route snapshots, logs, errors, or response objects.
- [x] Existing tests remain green — 124 tracked regression tests pass.

## A6. Migration
M13 callers construct runtimes with `credentialRef` + `credentialResolver`
instead of `apiKey` / `tavilyKey`. Until then the bridges keep the 124
regression tests green. Runtime instances stay credential-neutral: they own a
`CredentialResolver` service; the reference is selected per authorized
invocation and remains outside `ResolvedExecutionRoute`.

## A7. M11 rollback
- Tracked: `docs/plans/m0-m10-tracked.patch` covers only the M0–M10 tracked
  files. To revert M11's tracked edits specifically, restore
  `backend/environment.ts`, `app/env/.env.example`,
  `backend/server/http-server.ts` to their pre-M11 state.
- Untracked: delete `backend/security/` (7 files), the 8 M11 test files, and
  revert the 5 modified files inside `backend/integration/` (remove
  `RuntimeInvocation.credentialRef?`, restore the pre-M11 runtime/transport/
  custom bodies). `ResolvedExecutionRoute` was never touched, so routing is
  unaffected.

## A8. M12 Addendum — Research policy and Tavily

### Files
- Added: `backend/integration/research/policy.ts` (OneShot research policy:
  `decideResearchPolicy`, `resolveRequestedResearchMode`,
  `assertTavilyEvidence`, `EvidenceProvenance` constants,
  `ResearchPolicyError` with typed codes); 2 test files
  (`research-policy.test.ts` 10 tests, `research-collector-policy.test.ts` 7
  tests).
- Modified: `backend/agents/researcher/tool/tavily/evidence.ts` (provenance
  constants; string-identical output), `.../evidence/collector.ts` (policy
  gates the Tavily invocation; `workspace-file` provenance; policy decision
  recorded as evidence; optional TavilyRunner test seam),
  `backend/agents/researcher/workflow.ts` (`defaultResearchMode()` delegates
  to the policy; `provider-synthesis` evidence in `runWithRuntime`),
  `app/env/.env.example` (`ONESHOT_RESEARCH_MODE` documentation),
  `backend/tests/ts/researcher-validation-case.test.ts` (Tavily-capability
  fixture now runs with explicit `ONESHOT_RESEARCH_MODE=external` +
  `ONESHOT_TAVILY_MODE=off` — zero external calls).

### Decisions
- Tavily remains ONE external adapter. `local-only` and `hybrid` are OneShot
  policies; no "Tavily local mode" or "Tavily hybrid adapter" was created.
- `external` fails closed (`RESEARCH_EXTERNAL_UNAVAILABLE`); `hybrid` degrades
  gracefully to workspace evidence when the adapter is unconfigured.
- The collector previously read `process.env.TAVILY_API_KEY` directly; mode
  resolution is now centralized in `resolveRequestedResearchMode()`
  (explicit `ONESHOT_RESEARCH_MODE` wins; default derived from Tavily
  availability — behavior preserved).

### M12 gate (all verified by tests)
- Local-only mode makes NO Tavily request (recording-runner asserts zero ops).
- External mode fails clearly when Tavily is unavailable.
- Hybrid records local AND external evidence (user-prompt + tavily-search +
  tavily-extract).
- Tavily Search and Extract proven against mocks, independently observable.
- No prompt-only/workspace/provider-synthesis evidence can satisfy a Tavily
  assertion (`assertTavilyEvidence`, `RESEARCH_ASSERTION_UNSATISFIED`).

### Rollback
Delete `backend/integration/research/policy.ts` + the 2 M12 test files;
revert the 5 modified files above. No schema or route changes were made.

## A9. M13 Addendum — Researcher HTTP vertical slice

### Files
- Added: `backend/server/researcher-handlers.ts` (Researcher HTTP
  handlers: `handleListProviders`, `handleProviderTest`,
  `handleDiscoverModels`, `handleResearcherRun`, `handleReview`,
  `handleResearcherRoutes` dispatcher; `RouteSnapshot` interface;
  `normalizeProviderError`); `backend/server/researcher-context.ts`
  (lazy `getResearcherContext` constructing the router + runtime
  resolver); `backend/tests/ts/researcher-http-vertical-slice.test.ts`
  (10 tests).
- Modified: `backend/server/http-server.ts` (imports + wires researcher
  routes before existing review handler; adds `researcher?` to
  `HttpServerOptions`; review handler delegates to researcher review
  when `route_snapshot` present); `backend/agents/researcher/workflow.ts`
  (`runWithRuntime` gains optional `credentialRef` parameter passed
  through to `RuntimeInvocation`); `backend/schema/run-snapshot.schema.json`
  (added optional `route_snapshot` field);
  `backend/schema/contract-registry.json` (updated `schema_digest`);
  `backend/contracts/schema/types.ts` (added `route_snapshot?` to
  `RunSnapshot`).

### Decisions
- The researcher API is exposed through the EXISTING server — no second
  server was created.
- The review endpoint (`POST /api/runs/:runId/review`) is shared: runs
  with a `route_snapshot` are researcher runs → researcher review; runs
  without are plan-review runs → existing plan review handler.
- `body(req)` is consumed only for researcher-specific POST routes to
  avoid consuming the stream before the existing review handler.
- `runWithRuntime` passes `credentialRef` through to the invocation;
  the route itself never carries credentials.
- The `RouteSnapshot` is a non-secret subset of `ResolvedExecutionRoute`,
  safe for `RunSnapshot` persistence and HTTP response bodies.

### M13 gate (all verified by tests)
- A real HTTP request reaches the Researcher ✓
- Mock provider execution occurs ✓
- Valid request returns wait-human ✓
- Invalid request returns 400 ✓
- Provider errors are normalized ✓
- Route snapshot is associated with the run ✓
- HTTP and direct-harness results satisfy equivalent contracts ✓
- No credential fields in route snapshots ✓

### Rollback
Delete `backend/server/researcher-handlers.ts`,
`backend/server/researcher-context.ts`, and the M13 test file; revert
`http-server.ts`, `workflow.ts`, `run-snapshot.schema.json`,
`contract-registry.json`, and `types.ts`.

