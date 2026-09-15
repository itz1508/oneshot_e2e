# OneShot Pre-Refactor Fix Plan v3 (Complete)

## 1. Authority and Constraints

This is an **in-place incremental refactor**. No second application, no parallel backend, no `oneshot-v2/`, no duplicated canonical contracts.

**OneShot authority preserved for:**
- Validation
- Persistence
- Human gates
- Workflow transitions
- Accepted canonical state

**Runtime, provider, endpoint, and research layers are subordinate.** They return outputs and evidence; they do not choose transitions, approve their own output, persist canonical state, or bypass contract validation.

---

## 2. Corrected Architecture

The runtime adapter consumes a **ResolvedExecutionRoute**. Provider, endpoint, model, capability, and compatibility resolution happen **before** runtime invocation.

```
Workflow requirements
        |
        v
   Routing policy
        |
        v
Provider and endpoint candidates
        |
        v
    Endpoint health
        |
        v
    Model discovery
        |
        v
   Capability evidence
        |
        v
  Runtime compatibility
        |
        v
 Deterministic ranking
        |
        v
 Accepted route snapshot
        |
        v
  Runtime invocation
        |
        v
   Normalized result
        |
        v
OneShot validation and transition
```

Each stage is strictly ordered and observable. No stage skips to runtime invocation without an accepted route snapshot.

---

## 3. Domain Model

### 3.1 Capability Evidence

No boolean capability flags. Use states with provenance.

```typescript
interface CapabilityEvidence {
  capability: string;           // e.g., "tool-use", "structured-output"
  state: "unknown" | "declared" | "verified" | "failed" | "unsupported";
  source: "provider-preset" | "model-discovery" | "probe" | "manual" | "inferred";
  checkedAt?: Date;
  expiresAt?: Date;
  failureReason?: string;
}
```

### 3.2 Endpoint Definition vs. Endpoint Health

Persist endpoint configuration separately from mutable health results.

```typescript
interface EndpointDefinition {
  endpointId: string;
  providerId: string;
  baseUrl: string;
  allowedHeaders: string[];     // restricted set
  authMethod?: string;
  locality: "loopback" | "container-host" | "private-network" | "cloud" | "unknown";
  addedBy: "preset" | "user" | "discovery";
}

interface EndpointHealth {
  endpointId: string;
  reachable: boolean;
  latencyMs?: number;
  lastProbedAt?: Date;
  probeError?: string;
  redirectChain?: string[];
  dnsResolved?: boolean;
}
```

Locality belongs to endpoints. `private-network` is not treated as trusted automatically.

### 3.3 Resolved Execution Route

```typescript
interface ResolvedExecutionRoute {
  routeId: string;
  workflowId: string;
  policy: RoutingPolicy;
  runtimeId: string;
  providerId: string;
  endpointId: string;
  baseUrl: string;
  modelId: string;
  transport: "openai-chat" | "openai-responses" | "native" | "custom";
  locality: "loopback" | "container-host" | "private-network" | "cloud" | "unknown";
  capabilities: CapabilityEvidence[];
  researchMode: "disabled" | "local-only" | "external" | "hybrid";
  researchProviderId?: string;
  routeReason: string;
  rejectedCandidates: RejectedCandidate[];
  createdAt: Date;
  expiresAt: Date;
}
```

### 3.4 Routing Policy

```typescript
interface RoutingPolicy {
  mode: "manual" | "automatic";
  preferLocal: boolean;
  privacyFirst: boolean;
  allowFallback: boolean;
  allowCloudFallback: boolean;
  researchMode: "disabled" | "local-only" | "external" | "hybrid";
  allowedProviderIds?: string[];
  allowedRuntimeIds?: string[];
}
```

### 3.5 Deterministic Routing

Routing uses:

1. **Eligibility filtering** — runtime/provider/transport combinations structurally possible.
2. **Policy filtering** — enforce local-only, privacy-first, allowed lists.
3. **Capability filtering** — require verified or declared capabilities; reject failed where required.
4. **Privacy-boundary filtering** — block cloud endpoints in local-only mode.
5. **Deterministic scoring** — stable scoring based on locality, latency, capability freshness, preference.
6. **Stable tie-breaking** — by providerId, endpointId, modelId lexicographic order.

A model never chooses its own provider route.

---

## 4. Registries and Persistence

### 4.1 Registries

| Registry | Responsibility | Location |
|---|---|---|
| Provider registry | Built-in and custom provider definitions | `backend/integration/provider/registry.ts` |
| Endpoint registry | Endpoint definitions + health separation | `backend/integration/endpoint/registry.ts` |
| Model registry | Discovered and manual model candidates, scoped by provider+endpoint | `backend/integration/model/registry.ts` |
| Capability registry | Capability evidence per model+endpoint | `backend/integration/capability/registry.ts` |
| Runtime registry | Agent runtime adapters | `backend/integration/runtime/registry.ts` |
| Research registry | Tavily and future research adapters | `backend/integration/research/registry.ts` |
| Route snapshot store | Accepted route persistence for reproducibility | `backend/runtime/route-snapshots.ts` |

### 4.2 Persistence

- **Endpoint definitions** — source-controlled presets + user configuration through existing persistence.
- **Endpoint health** — transient, in-memory or short-lived cache; not canonical.
- **Route snapshots** — persisted as run metadata for reproducibility and retry.
- **Conversations** — canonical persistence before chat UI; see M14.
- **Credentials** — `CredentialReference` only; no arbitrary key storage API without authentication.

### 4.3 What Not to Add

- No automatic addition of operational registry schemas to `backend/schema/contract-registry.json`.
- No file-backed registry override in early milestones.
- No unrestricted custom headers.

---

## 5. Milestones M0–M19

---

### M0: Baseline

**Goal:** Verify the current repository before any changes.

**Existing files verified before adding folders:**
- `backend/index.ts`
- `backend/server/http-server.ts`
- `backend/agents/researcher/workflow.ts`
- `backend/agents/researcher/tool/tavily/bridge.ts`
- `backend/workflow/graph.json`
- `backend/schema/contract-registry.json`
- `backend/runtime/` run repository
- `app/web/app/researcher/`
- `package.json` scripts

**Files reused:** None (read-only).

**Files modified:** None.

**Files added:**
- `docs/plans/Pre_Refactor_Baseline.md` (inventory only)

**Interfaces:** None.

**Security implications:** None.

**Migration:** Record build/test results and canonical file hashes.

**Rollback:** `git checkout main`.

**Unit tests:** Run existing suite.

**Mock integration tests:** Run existing suite.

**API tests:** Run existing suite.

**Acceptance gate:** `npm run build`, `npm test`, `npm run verify` pass on current `main` without modification.

---

### M1: Operational Domain Types

**Goal:** Define neutral, registry-backed operational types for provider, endpoint, model, capability, route, and policy. Do not change existing workflow or runtime code yet.

**Existing files verified before adding folders:**
- `backend/integration/catalog.ts`

**Files reused:**
- `backend/integration/catalog.ts` (types align later)

**Files modified:** None.

**Files added:**
- `backend/integration/core/types.ts`
- `backend/integration/core/capability.ts`
- `backend/integration/core/policy.ts`
- `backend/integration/core/route.ts`

**Interfaces:**
- `ProviderDefinition`
- `EndpointDefinition`
- `EndpointHealth`
- `ModelCandidate`
- `CapabilityEvidence`
- `RoutingPolicy`
- `ResolvedExecutionRoute`
- `RejectedCandidate`

**Security implications:**
- Endpoint definition includes restricted `allowedHeaders`.
- Capability evidence includes provenance and expiry.
- Route includes non-secret fields only.

**Migration:** Add types alongside existing code; no consumer changes.

**Rollback:** Delete `backend/integration/core/`.

**Unit tests:**
- `backend/tests/ts/operational-types.test.ts`
- `backend/tests/ts/capability-evidence.test.ts`

**Mock integration tests:** None.

**API tests:** None.

**Acceptance gate:** New types compile; existing tests pass.

---

### M2: Registries

**Goal:** Build provider, endpoint, model, runtime, and research registries with in-memory defaults.

**Existing files verified before adding folders:**
- `backend/integration/catalog.ts`
- `backend/runtime/run-repository.ts`

**Files reused:**
- `backend/integration/catalog.ts` — delegates to registries

**Files modified:**
- `backend/integration/catalog.ts` — register built-ins via registries

**Files added:**
- `backend/integration/provider/registry.ts`
- `backend/integration/provider/presets/ollama.ts`
- `backend/integration/provider/presets/groq.ts`
- `backend/integration/provider/presets/openai.ts`
- `backend/integration/provider/custom.ts`
- `backend/integration/endpoint/registry.ts`
- `backend/integration/model/registry.ts`
- `backend/integration/runtime/registry.ts`
- `backend/integration/research/registry.ts`
- `backend/integration/research/tavily-adapter.ts`

**Interfaces:**
- `ProviderRegistry`
- `EndpointRegistry`
- `ModelRegistry`
- `RuntimeRegistry`
- `ResearchRegistry`

**Security implications:**
- Registries store definitions, not live credentials.
- Custom provider input validation applied in M11.
- Presets source-controlled and read-only.

**Migration:** Move hard-coded provider metadata into preset files; catalog delegates lookup.

**Rollback:** Revert catalog to direct metadata.

**Unit tests:**
- `backend/tests/ts/provider-registry.test.ts`
- `backend/tests/ts/endpoint-registry.test.ts`
- `backend/tests/ts/model-registry.test.ts`
- `backend/tests/ts/runtime-registry.test.ts`
- `backend/tests/ts/research-registry.test.ts`

**Mock integration tests:** None.

**API tests:** None.

**Acceptance gate:** All registries list built-ins and accept custom entries without external calls.

---

### M3: Workflow Requirements

**Goal:** Define what the workflow demands from the execution layer: runtime, provider, model, capabilities, transport, research mode.

**Existing files verified before adding folders:**
- `backend/agents/researcher/workflow.ts`
- `backend/workflow/graph.json`

**Files reused:**
- `backend/agents/researcher/workflow.ts`

**Files modified:**
- `backend/agents/researcher/workflow.ts` — emit structured execution requirements object

**Files added:**
- `backend/agents/researcher/execution-requirements.ts`

**Interfaces:**
- `ExecutionRequirements`
- `WorkflowRequirements`

**Security implications:**
- Requirements never include credentials.
- Requirements are canonical and versioned.

**Migration:** Add requirements emission alongside existing code path.

**Rollback:** Remove requirements emission.

**Unit tests:**
- `backend/tests/ts/execution-requirements.test.ts`

**Mock integration tests:** None.

**API tests:** None.

**Acceptance gate:** Researcher workflow describes its execution requirements without changing existing behavior.

---

### M4: Fake Runtime Proof

**Goal:** Prove workflow neutrality with a deterministic fake runtime that consumes a resolved route.

**Existing files verified before adding folders:**
- `backend/agents/researcher/workflow.ts`

**Files reused:**
- `backend/agents/researcher/workflow.ts`

**Files modified:**
- `backend/agents/researcher/workflow.ts` — optional fake runtime path behind flag

**Files added:**
- `backend/integration/runtime/fake-runtime.ts`
- `backend/integration/runtime/types.ts`

**Interfaces:**
- `AgentRuntime`
- `RuntimeInvocation`
- `NormalizedResult`

**Security implications:**
- Fake runtime never leaves the process.
- No credentials used.

**Migration:** Add fake runtime; invoke from test-only workflow path.

**Rollback:** Remove fake runtime files and flag.

**Unit tests:**
- `backend/tests/ts/fake-runtime.test.ts`
- `backend/tests/ts/fake-runtime-route.test.ts`

**Mock integration tests:**
- `backend/tests/ts/researcher-fake-runtime.test.ts`

**API tests:** None.

**Acceptance gate:** Researcher run completes end-to-end using fake runtime with deterministic output.

---

### M5: Generic Compatible Mock Transport Proof

**Goal:** Prove custom-provider transport using a generic OpenAI-compatible mock server, `/models` discovery, and actual mock chat invocation.

**Existing files verified before adding folders:**
- `backend/integration/provider/registry.ts`
- `backend/integration/endpoint/registry.ts`
- `backend/integration/model/registry.ts`

**Files reused:**
- `backend/integration/provider/custom.ts`
- `backend/integration/endpoint/registry.ts`
- `backend/integration/model/registry.ts`

**Files modified:**
- `backend/integration/provider/custom.ts` — support OpenAI-compatible base URL

**Files added:**
- `backend/integration/transport/openai-compatible-client.ts`
- `backend/integration/mock/openai-compatible-mock-server.ts`
- `backend/integration/model/discovery/openai-compatible-discovery.ts`

**Interfaces:**
- `OpenAICompatibleClient`
- `ModelDiscovery`
- `ChatInvocation`

**Security implications:**
- Mock server only runs in tests.
- Base URL validation in M8.

**Migration:** Add OpenAI-compatible client; connect custom provider to mock server.

**Rollback:** Remove transport client and mock server.

**Unit tests:**
- `backend/tests/ts/openai-compatible-mock.test.ts`
- `backend/tests/ts/openai-compatible-discovery.test.ts`

**Mock integration tests:**
- `backend/tests/ts/custom-provider-mock-chat.test.ts`

**API tests:** None.

**Acceptance gate:** Custom provider discovers models from mock `/models`, selects one, completes chat invocation through mock endpoint.

---

### M6: Capability Evidence and Compatibility

**Goal:** Implement capability evidence states, probes, and runtime compatibility.

**Existing files verified before adding folders:**
- `backend/integration/core/capability.ts`
- `backend/integration/runtime/registry.ts`

**Files reused:**
- `backend/integration/core/types.ts`
- `backend/integration/runtime/registry.ts`

**Files modified:** None.

**Files added:**
- `backend/integration/capability/registry.ts`
- `backend/integration/capability/probe.ts`
- `backend/integration/capability/structured-output-probe.ts`
- `backend/integration/capability/tool-use-probe.ts`
- `backend/integration/routing/runtime-compatibility.ts`

**Interfaces:**
- `CapabilityRegistry`
- `CapabilityProbe`
- `RuntimeCompatibilityResolver`

**Security implications:**
- Probes target only approved endpoints.
- No arbitrary network scanning.

**Migration:** Add capability evidence layer; runtime compatibility evaluates evidence and transport.

**Rollback:** Delete capability and compatibility modules.

**Unit tests:**
- `backend/tests/ts/capability-evidence-states.test.ts`
- `backend/tests/ts/structured-output-probe.test.ts`
- `backend/tests/ts/tool-use-probe.test.ts`
- `backend/tests/ts/runtime-compatibility.test.ts`

**Mock integration tests:**
- `backend/tests/ts/capability-probe-mock.test.ts`

**API tests:** None.

**Acceptance gate:** Capability evidence supports all five states; runtime compatibility uses evidence and transport.

---

### M7: Deterministic Routing

**Goal:** Implement eligibility, policy, capability, privacy filtering, deterministic scoring, and stable tie-breaking.

**Existing files verified before adding folders:**
- `backend/integration/core/policy.ts`
- `backend/integration/provider/registry.ts`
- `backend/integration/endpoint/registry.ts`
- `backend/integration/model/registry.ts`
- `backend/integration/capability/registry.ts`

**Files reused:** All registry files above.

**Files modified:** None.

**Files added:**
- `backend/integration/routing/router.ts`
- `backend/integration/routing/eligibility-filter.ts`
- `backend/integration/routing/policy-filter.ts`
- `backend/integration/routing/capability-filter.ts`
- `backend/integration/routing/privacy-filter.ts`
- `backend/integration/routing/scorer.ts`
- `backend/integration/routing/tie-breaker.ts`

**Interfaces:**
- `Router`
- `RouteResult`
- `RejectedCandidate`

**Security implications:**
- Privacy filter enforces local-only and privacy-first policies.
- No model chooses its own route.

**Migration:** Wire router to registries and policy.

**Rollback:** Delete routing modules.

**Unit tests:**
- `backend/tests/ts/router-eligibility.test.ts`
- `backend/tests/ts/router-policy.test.ts`
- `backend/tests/ts/router-capability.test.ts`
- `backend/tests/ts/router-privacy.test.ts`
- `backend/tests/ts/router-scoring.test.ts`
- `backend/tests/ts/router-tie-break.test.ts`

**Mock integration tests:**
- `backend/tests/ts/router-end-to-end.test.ts`

**API tests:** None.

**Acceptance gate:** Router returns deterministic, explainable routes for all policy combinations.

---

### M8: Safe Endpoint Discovery

**Goal:** Probe approved endpoint candidates safely without scanning arbitrary subnets.

**Existing files verified before adding folders:**
- `backend/integration/endpoint/registry.ts`

**Files reused:**
- `backend/integration/endpoint/registry.ts`

**Files modified:** None.

**Files added:**
- `backend/integration/endpoint/health-probe.ts`
- `backend/integration/endpoint/locality-detector.ts`
- `backend/integration/endpoint/url-validator.ts`
- `backend/integration/endpoint/dns-checker.ts`
- `backend/integration/endpoint/redirect-validator.ts`
- `backend/integration/endpoint/port-policy.ts`
- `backend/integration/endpoint/metadata-blocklist.ts`

**Interfaces:**
- `EndpointHealthProbe`
- `LocalityDetector`
- `UrlValidator`

**Security implications:**
- URL validation restricts protocols and ports.
- DNS resolution checks before connection.
- Redirect revalidation required.
- Metadata endpoints blocked.
- Probe timeouts and concurrency limits enforced.
- Authorization required for probe APIs where applicable.

**Migration:** Add safe probe layer; endpoint registry uses it for health checks.

**Rollback:** Delete probe modules; use manual health flags.

**Unit tests:**
- `backend/tests/ts/url-validator.test.ts`
- `backend/tests/ts/locality-detector.test.ts`
- `backend/tests/ts/redirect-validator.test.ts`
- `backend/tests/ts/port-policy.test.ts`
- `backend/tests/ts/health-probe-timeout.test.ts`

**Mock integration tests:**
- `backend/tests/ts/health-probe-mock.test.ts`

**API tests:** None.

**Acceptance gate:** Probes only approved URLs; locality detected correctly; timeouts and redirects handled safely.

---

### M9: Strands Migration

**Goal:** Migrate existing Strands runtime to consume a `ResolvedExecutionRoute` via an adapter.

**Existing files verified before adding folders:**
- `backend/agents/researcher/workflow.ts`
- `backend/agents/researcher/strands-tools.ts`
- `backend/agents/researcher/tool/tavily/bridge.ts`

**Files reused:**
- `backend/agents/researcher/strands-tools.ts`
- `backend/agents/researcher/tool/tavily/bridge.ts`

**Files modified:**
- `backend/agents/researcher/workflow.ts` — use resolved route runtime
- `backend/agents/researcher/strands-tools.ts` — accept neutral tool definitions

**Files added:**
- `backend/integration/runtime/strands-adapter.ts`
- `backend/integration/runtime/strands-openai-model.ts`
- `backend/agents/researcher/tool/neutral-tool-converter.ts`

**Interfaces:**
- `StrandsAdapter`
- `OneShotToolDefinition`

**Security implications:**
- Adapter receives route, not credentials directly.
- Tool conversion preserves validation contract.

**Migration bridge:**
```
Current verified Researcher
↓
Introduce OneShotToolDefinition
↓
Add conversion to Strands FunctionTool
↓
Run original and converted tests
↓
Remove direct FunctionTool construction from Researcher
```

**Rollback:** Revert workflow to direct Strands construction.

**Unit tests:**
- `backend/tests/ts/strands-adapter.test.ts`
- `backend/tests/ts/neutral-tool-converter.test.ts`

**Mock integration tests:**
- `backend/tests/ts/researcher-strands-mock.test.ts`
- `backend/tests/ts/researcher-strands-ollama-compat.test.ts`

**API tests:** None.

**Acceptance gate:** Researcher workflow runs through Strands adapter and produces equivalent normalized contracts, evidence classes, validation, transitions, and errors.

---

### M10: Direct Compatible Runtime

**Goal:** Add a direct OpenAI-compatible runtime that consumes the same `ResolvedExecutionRoute`.

**Existing files verified before adding folders:**
- `backend/integration/transport/openai-compatible-client.ts`

**Files reused:**
- `backend/integration/transport/openai-compatible-client.ts`

**Files modified:** None.

**Files added:**
- `backend/integration/runtime/direct-openai-runtime.ts`

**Interfaces:**
- `DirectOpenAIRuntime`

**Security implications:**
- Uses route credentials by reference.
- No credential leakage in logs.

**Migration:** Add direct runtime; both Strands and direct runtime use same route type.

**Rollback:** Delete direct runtime.

**Unit tests:**
- `backend/tests/ts/direct-openai-runtime.test.ts`

**Mock integration tests:**
- `backend/tests/ts/researcher-direct-runtime-mock.test.ts`

**API tests:** None.

**Acceptance gate:** Direct runtime completes a Researcher run through the mock endpoint.

---

### M11: Credentials and Protected Provider API

**Goal:** Define credential policy before exposing provider configuration APIs.

**Existing files verified before adding folders:**
- `backend/environment.ts`
- `backend/server/http-server.ts`

**Files reused:**
- `backend/environment.ts`

**Files modified:**
- `backend/environment.ts` — add credential policy
- `backend/server/http-server.ts` — register protected routes later

**Files added:**
- `backend/security/credential-policy.ts`
- `backend/security/credential-reference.ts`
- `backend/security/header-allowlist.ts`
- `backend/server/middleware/auth-check.ts` (if auth exists)

**Interfaces:**
- `CredentialPolicy`
- `CredentialReference`
- `AllowedHeaderSet`

**Security implications:**
- If no authenticated user system exists, no public API stores arbitrary provider keys.
- Custom headers restricted: no hop-by-hop, no `Proxy-*`, no `Host`, no `Cookie`, no conflicting `Authorization`.
- Credentials stored as `CredentialReference` in production.

**Migration:** Enforce credential policy before adding `/api/providers` configuration endpoints.

**Rollback:** Revert credential policy to env-var-only.

**Unit tests:**
- `backend/tests/ts/credential-policy.test.ts`
- `backend/tests/ts/header-allowlist.test.ts`
- `backend/tests/ts/credential-reference.test.ts`

**Mock integration tests:** None.

**API tests:** None.

**Acceptance gate:** Credential policy blocks unauthenticated credential storage; header allowlist rejects dangerous headers.

---

### M12: Research Policy and Tavily

**Goal:** Model research as a policy, not a model capability. Tavily is one adapter.

**Existing files verified before adding folders:**
- `backend/integration/research/registry.ts`
- `backend/integration/research/tavily-adapter.ts`

**Files reused:**
- `backend/integration/research/tavily-adapter.ts`

**Files modified:**
- `backend/agents/researcher/workflow.ts` — select research adapter based on policy

**Files added:**
- `backend/integration/research/research-policy.ts`

**Interfaces:**
- `ResearchPolicy`
- `ResearchAdapter`

**Security implications:**
- Research policy controls external calls.
- `local-only` mode disables Tavily.

**Migration:** Add research policy; workflow selects Tavily adapter or none based on policy.

**Rollback:** Revert to direct Tavily bridge.

**Unit tests:**
- `backend/tests/ts/research-policy.test.ts`

**Mock integration tests:**
- `backend/tests/ts/tavily-mock.test.ts`
- `backend/tests/ts/researcher-local-only-no-tavily.test.ts`

**API tests:** None.

**Acceptance gate:** Researcher run respects `researchMode`: `disabled`, `local-only`, `external`, `hybrid`.

---

### M13: Researcher HTTP Path

**Goal:** Expose the verified Researcher workflow through a minimal, neutral HTTP API.

**Existing files verified before adding folders:**
- `backend/server/http-server.ts`

**Files reused:**
- `backend/server/http-server.ts`

**Files modified:**
- `backend/server/http-server.ts` — register routes

**Files added:**
- `backend/api/health.ts`
- `backend/api/ready.ts`
- `backend/api/providers/list.ts`
- `backend/api/providers/test.ts`
- `backend/api/providers/discover-models.ts`
- `backend/api/runs/researcher-run.ts`
- `backend/api/runs/status.ts`
- `backend/api/runs/review.ts`

**Interfaces:**
- `HealthHandler`
- `ProviderListHandler`
- `ResearcherRunHandler`

**Security implications:**
- Routes respect credential policy from M11.
- No provider keys returned in responses.
- Run status only exposes canonical stage data.

**Migration:** Add routes; handlers delegate to workflow, router, and runtime registries.

**Rollback:** Remove route registrations.

**Unit tests:**
- `backend/tests/ts/api-health.test.ts`
- `backend/tests/ts/api-ready.test.ts`

**Mock integration tests:**
- `backend/tests/ts/api-providers-mock.test.ts`
- `backend/tests/ts/api-discover-models-mock.test.ts`
- `backend/tests/ts/api-researcher-run-mock.test.ts`

**API tests:**
- `backend/tests/ts/api-run-status.test.ts`
- `backend/tests/ts/api-run-review.test.ts`

**Acceptance gate:** All listed API endpoints pass with mock providers; no external calls during `npm test`.

---

### M14: Conversation Persistence

**Goal:** Define and implement conversation persistence before building the chat UI.

**Existing files verified before adding folders:**
- `backend/runtime/run-repository.ts`

**Files reused:**
- `backend/runtime/run-repository.ts`

**Files modified:** None.

**Files added:**
- `backend/runtime/conversation-repository.ts`
- `backend/schema/conversation.schema.json`
- `backend/api/conversations/list.ts`
- `backend/api/conversations/get.ts`
- `backend/api/conversations/messages.ts`

**Interfaces:**
- `Conversation`
- `Message`
- `ConversationRepository`

**Fields:**
- `conversationId`
- `title`
- `createdAt`, `updatedAt`
- `messages[]` with ordering
- `runAssociations[]`
- `partialMessageState` for streaming recovery

**Security implications:**
- Conversations associated with authenticated user or local session only.
- No credential leakage in messages.

**Migration:** Add conversation repository and schema; keep run repository unchanged.

**Rollback:** Delete conversation repository and schema.

**Unit tests:**
- `backend/tests/ts/conversation-repository.test.ts`
- `backend/tests/ts/message-ordering.test.ts`

**Mock integration tests:**
- `backend/tests/ts/conversation-run-association.test.ts`

**API tests:**
- `backend/tests/ts/api-conversations.test.ts`

**Acceptance gate:** Conversations, messages, ordering, run associations, and partial state persist and reload correctly.

---

### M15: Streaming and Cancellation

**Goal:** Define normalized OneShot public events, transport, cancellation, reconnection, replay, inline forwarding, and queue forwarding.

**Existing files verified before adding folders:**
- `backend/server/http-server.ts`
- `backend/pipeline/` workers

**Files reused:**
- `backend/server/http-server.ts`

**Files modified:** None.

**Files added:**
- `backend/events/public-events.ts`
- `backend/events/stream-transport.ts`
- `backend/events/replay-buffer.ts`
- `backend/events/cancellation-token.ts`
- `backend/pipeline/event-forwarder.ts`

**Interfaces:**
- `OneShotPublicEvent`
- `StreamTransport`
- `ReplayBuffer`
- `CancellationToken`

**Security implications:**
- Events expose only canonical stage data.
- Cancellation tokens bound to run ownership.

**Migration:** Add event layer; no workflow changes.

**Rollback:** Delete event modules.

**Unit tests:**
- `backend/tests/ts/public-events.test.ts`
- `backend/tests/ts/cancellation-token.test.ts`
- `backend/tests/ts/replay-buffer.test.ts`

**Mock integration tests:**
- `backend/tests/ts/stream-inline-mock.test.ts`

**API tests:**
- `backend/tests/ts/api-stream-mock.test.ts`

**Acceptance gate:** Streaming, cancellation, replay, and inline/queue forwarding work with mock runtime.

---

### M16: Ollama

**Goal:** Add Ollama as a local model provider with dynamic discovery and safe detection.

**Existing files verified before adding folders:**
- `backend/integration/provider/presets/ollama.ts`
- `backend/integration/endpoint/health-probe.ts`
- `backend/integration/model/discovery/openai-compatible-discovery.ts`

**Files reused:** All above.

**Files modified:**
- `backend/integration/provider/presets/ollama.ts` — add discovery and OpenAI-compatible transport

**Files added:**
- `backend/integration/provider/ollama-discovery.ts`
- `app/web/src/features/providers/ollama-connect.tsx` (preparation only; UI in M18)

**Interfaces:**
- `OllamaDiscovery`

**Security implications:**
- Detect only approved endpoints (`localhost:11434`, `host.docker.internal:11434`, private ranges if configured).
- No silent installation.
- No placeholder key displayed.

**Migration:** Add Ollama preset with discovery and OpenAI-compatible chat endpoint.

**Rollback:** Remove Ollama preset and discovery.

**Unit tests:**
- `backend/tests/ts/ollama-discovery-mock.test.ts`
- `backend/tests/ts/ollama-locality.test.ts`

**Mock integration tests:**
- `backend/tests/ts/ollama-mock-chat.test.ts`
- `backend/tests/ts/researcher-ollama-local.test.ts`

**API tests:**
- `backend/tests/ts/api-ollama-discover.test.ts`

**Acceptance gate:** Ollama detected, models discovered, Researcher run completes in local-only mode without external calls.

---

### M17: Cloud Presets

**Goal:** Add Groq and OpenAI built-in presets after generic architecture is proven.

**Existing files verified before adding folders:**
- `backend/integration/provider/presets/groq.ts`
- `backend/integration/provider/presets/openai.ts`

**Files reused:**
- `backend/integration/provider/presets/groq.ts`
- `backend/integration/provider/presets/openai.ts`

**Files modified:**
- `backend/integration/provider/presets/groq.ts` — add model hints and discovery
- `backend/integration/provider/presets/openai.ts` — add model hints and discovery

**Files added:**
- `backend/integration/provider/model-hints/groq.ts`
- `backend/integration/provider/model-hints/openai.ts`

**Interfaces:**
- `ModelHint`

**Security implications:**
- Model hints not authoritative; discovery overrides.
- Credentials via `CredentialReference` only.

**Migration:** Add model hints and discovery; built-ins extend generic transport.

**Rollback:** Remove model hints.

**Unit tests:**
- `backend/tests/ts/model-hints.test.ts`
- `backend/tests/ts/groq-discovery-mock.test.ts`
- `backend/tests/ts/openai-discovery-mock.test.ts`

**Mock integration tests:**
- `backend/tests/ts/groq-mock-chat.test.ts`
- `backend/tests/ts/openai-mock-chat.test.ts`

**API tests:** None.

**Acceptance gate:** Groq and OpenAI presets route correctly and respect research and privacy policies.

---

### M18: UI

**Goal:** Build provider configuration and chat workspace UI after conversation persistence and streaming are defined.

**Existing files verified before adding folders:**
- `app/web/app/researcher/`
- `app/web/components/`

**Files reused:**
- `app/web/app/researcher/`
- `app/web/components/`

**Files modified:**
- `app/web/app/researcher/` — refactor to use M13–M15 APIs

**Files added:**
- `app/web/src/features/providers/provider-settings.tsx`
- `app/web/src/features/providers/ollama-connect.tsx`
- `app/web/src/features/conversations/conversation-list.tsx`
- `app/web/src/features/conversations/message-list.tsx`
- `app/web/src/components/chat/ChatContainer.tsx`
- `app/web/src/components/integrations/IntegrationsDrawer.tsx`

**Interfaces:** React component props aligned to API types.

**Security implications:**
- UI never stores provider keys in local storage.
- Credential fields use controlled inputs bound to credential policy.

**Migration:** Replace direct provider config with settings form; chat workspace uses conversation API and event stream.

**Rollback:** Revert `app/web/app/researcher/` from prior commit.

**Unit tests:**
- `app/web/tests/` updated/added

**Mock integration tests:** None.

**API tests:**
- Browser smoke test

**Acceptance gate:** UI can configure provider, start Researcher run, stream events, and persist conversation.

---

### M19: Redis and Production Hardening

**Goal:** Ensure queue mode works and standalone mode remains default; finalize production security.

**Existing files verified before adding folders:**
- `backend/pipeline/`
- `backend/runtime/`
- `backend/environment.ts`

**Files reused:**
- `backend/runtime/run-repository.ts`
- `backend/pipeline/` processors
- `backend/environment.ts`

**Files modified:**
- `backend/environment.ts` — add queue and production flags

**Files added:**
- `backend/runtime/queue-adapter.ts`
- `backend/events/queue-forwarder.ts`
- `backend/security/production-checklist.ts`

**Interfaces:**
- `QueueAdapter`
- `QueueEventForwarder`

**Security implications:**
- Standalone mode starts without Redis.
- Queue mode uses BullMQ when configured.
- Credential policy enforced in production.
- No public credential storage without authentication.

**Migration:** Add queue adapter; event forwarder sends public events to queue consumer.

**Rollback:** Remove queue adapter and forwarder.

**Unit tests:**
- `backend/tests/ts/queue-adapter.test.ts`
- `backend/tests/ts/queue-event-forwarder.test.ts`

**Mock integration tests:**
- `backend/tests/ts/queue-inline-mock.test.ts`

**API tests:**
- `npm run test:pipeline:e2e` with Redis up

**Acceptance gate:**
- `ONESHOT_SERVER_READY port=8787 mode=standalone` starts without Redis.
- Queue E2E passes with Redis.
- Production credential policy enforced.

---

## 6. Required Routing Tests

Add tests covering:

- Manual provider and model selection
- Automatic selection
- Prefer-local routing
- Privacy-first routing
- Custom model ID
- Custom OpenAI-compatible endpoint
- Manual model when discovery is unavailable
- Two providers exposing the same model ID
- Local Ollama model discovery
- Container-host Ollama candidate
- Unreachable local endpoint
- Model missing after endpoint succeeds
- Model connected but structured output fails
- Runtime incompatible with transport
- Strands plus compatible Ollama route
- Local model plus Tavily hybrid research
- Local-only mode makes no cloud calls
- No silent local-to-cloud fallback
- User-approved local-to-cloud fallback
- Provider health changes during routing
- All candidates rejected with explainable reasons
- Custom provider added without canonical workflow changes
- Runtime replaced without workflow contract changes

---

## 7. Required UI Behavior

**Provider settings form must support:**

- Built-in Provider
- Add Custom Provider
- Connect Local Provider
- Detect Local Services
- Custom Base URL
- Authentication Method
- Credential field when required
- Custom approved headers
- Test Endpoint
- Discover Models
- Enter Model Manually
- Verify Capabilities
- Select Runtime
- Routing Mode
- Allow Fallback
- Allow Cloud Fallback
- Research Mode

**Status display must show:**

- Endpoint locality
- Connection status
- Discovery status
- Selected model
- Capability status
- Compatible runtimes
- Routing reason
- Rejected candidate reasons

**Ollama-specific UI:**

- Authentication: Not required
- Endpoint: Local
- Installed models
- Refresh models
- Installation guidance if not detected
- No internal placeholder key shown as credential

---

## 8. Final Invariant Checklist

The plan is acceptable only if all these operations are possible **without canonical workflow changes**:

- Add a custom model ID
- Add a custom OpenAI-compatible endpoint
- Add a local model server
- Add a new provider adapter
- Add a new research provider
- Add a new agent SDK runtime
- Replace Strands
- Disable Tavily
- Route between valid integrations
- Run entirely locally
- Run in hybrid mode
- Run entirely through user-owned cloud credentials

**OneShot authority preserved for:**

- Validation
- Persistence
- Human gates
- Workflow transitions
- Accepted canonical state

---

## 9. Internal Consistency Check

| Previous Gap | Fix |
|---|---|
| Runtime adapter preceded resolution | Architecture now shows runtime invocation after accepted route snapshot |
| Capability booleans | Replaced with `unknown/declared/verified/failed/unsupported` evidence |
| Endpoint definition mixed with health | Separated into `EndpointDefinition` and `EndpointHealth` |
| Locality on providers | Moved to endpoints with `loopback/container-host/private-network/cloud/unknown` |
| Single M3 proof | Split into M4 (fake runtime) and M5 (mock transport) |
| Universal OpenAI invoker | Removed; Strands and direct runtime each consume `ResolvedExecutionRoute` |
| Tavily modes as files | Removed; research modes are OneShot policies |
| Research in model probes | Research policy separate from model capability evidence |
| Non-deterministic routing | Added eligibility/policy/capability/privacy filtering + deterministic scoring + stable tie-breaking |
| No route snapshots | Added `ResolvedExecutionRoute` with route persistence and retry behavior |
| Arbitrary network detection | Added URL validation, DNS, redirect revalidation, port/protocol restrictions, metadata blocking, timeouts, concurrency limits |
| Registry schemas in canonical contract registry | Operational definitions stay under integration validation; canonical additions require explicit justification |
| File-backed registry override | Removed; use source-controlled presets, in-memory test registries, existing persistence, env config, `CredentialReference` |
| Chat UI before conversation persistence | Conversation persistence moved to M14, before UI at M18 |
| Streamed UI before streaming milestone | Streaming/cancellation defined in M15, before UI in M18 |
| Provider config API before credential policy | Credential policy and header allowlist moved to M11, before provider API in M13 |
| Unrestricted custom headers | Header allowlist blocks hop-by-hop, proxy, host, cookie, and conflicting auth headers |
| Hard-coded model catalogs | Renamed to model hints; live availability from discovery |
| "Identical model output" acceptance | Replaced with equivalent normalized contracts, evidence classes, validation, transitions, and errors |
| Old milestone order | Replaced with M0–M19 sequence |

---

## 10. Next Step

This plan is internally consistent and ready for implementation. Begin implementation at **M0**, proceeding milestone by milestone with the hard gates defined above.

> Note: This is a planning document, not a contract change. Operational schemas are intentionally kept under integration validation; canonical contract registry additions require explicit justification per milestone. No file in `backend/schema/contract-registry.json` is modified by this plan unless a milestone explicitly justifies it.






