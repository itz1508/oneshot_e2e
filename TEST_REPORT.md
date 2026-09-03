# OneShot Production E2E 1.1.0 — Google ADK + Gemma 2 Integration Verification

## Product result

```text
PASSED
```

The canonical OneShot workflow remains unchanged. Google ADK + Gemma 2 is integrated only at the Researcher provider boundary.

## Canonical chain exercised

```text
Prompt_id
→ Researcher
→ Researcher(id)
→ Planner
→ audit_id
→ Refactor
→ same plan_id
→ Gap Analysis
→ gap_0 + plan_id
→ Evaluation
→ plan_id
→ Schema Validation
→ Fixture Validation
→ Goal Validation
→ all VALID
→ CONFIRMED
→ CREATE HASH
→ HASH
→ DONE
```

## Integrated provider path

```text
ResearcherWorkflow (TypeScript)
→ AdkGemmaResearchProvider (TypeScript)
→ persistent Python worker pool
→ Google ADK LlmAgent
→ LiteLLM
→ Ollama
→ gemma2:9b
→ structured non-canonical research draft
→ fresh run-scoped canonical Researcher artifacts
→ normal OneShot validation/proof chain
```

## Previous local profile retained where useful

| Setting | Value |
|---|---|
| Model | `gemma2:9b` |
| Ollama | `http://localhost:11434` |
| Context length | `8192` |
| Keep alive | `5m` |
| Parallel model requests | `2` |
| Research worker pool | `2` |
| Redis | `redis://localhost:6379/0` |
| Cache TTL | `3600` seconds |

The earlier generic `num_thread` and `batch_size` suggestions are not forced into the ADK/Ollama path because this release only carries settings that are actually consumed by the current runtime/service configuration.

## Cache proof

Redis is an acceleration layer only.

```text
semantic prompt + Gemma model
→ cached ADK research draft
→ fresh canonical IDs
→ fresh Researcher artifacts
→ fresh Planner/Refactor/Gap/Evaluation
→ fresh Triple Validation
→ fresh confirmed core
→ fresh HASH
```

Run-specific `prompt_id`, `context_id`, result state, confirmed package, and HASH are not cache inputs/values.

If Redis is unavailable, the ADK worker uses an in-process TTL cache at the same non-canonical boundary.

## Useful production controls included

- Ollama model warm retention (`5m`).
- Bounded model concurrency (`2`).
- 8192-token Ollama context configuration.
- Redis draft cache with 3600-second TTL.
- Ollama and Redis health checks in Docker Compose.
- Persistent ADK worker pool to avoid spawning Python for every request.
- HTTP CSP, frame, MIME-sniffing, referrer and permissions headers.
- Configured CORS allow-origin.
- API rate limiting.
- Optional bearer-token API protection via `ONESHOT_API_TOKEN`.
- GPU Docker override for Ollama where the host supports it.

## Material not activated

- Node.js `cluster`: current SSE subscriptions, run repository and filesystem artifacts are process-local.
- Kubernetes HPA: horizontal replicas require shared run/event/artifact infrastructure first.
- MongoDB/PostgreSQL backup commands: this package does not use either as its canonical artifact store.
- Application-level self-signed TLS: deployment/reverse-proxy concern, not required by this local product runtime.
- JWT identity system: no canonical OneShot user-identity contract exists in this package; optional bearer protection is used instead.

## Deterministic/integration test execution

```text
Python canonical/proof suite:       39/39 PASSED
TypeScript Role/runtime suite:      23/23 PASSED
TypeScript source compile:          PASSED
ADK provider adapter full chain:    PASSED
ADK provider HTTP/UI E2E:           PASSED
Cache semantic reuse proof:         PASSED
All fixture operators:              PASSED
Provider failure → Done ROOT_CAUSE: PASSED
Hash equality/mutation proofs:      PASSED
HTTP security header proof:         PASSED
Dependency meaning/step-edge proof: PASSED
Job-specific fixture mutation:      NOT_VALID as required
Unresolvable evidence reference:    ROOT_CAUSE as required
Configured ADK timeout:             ROOT_CAUSE within bound
Conditional ADK pin verification:   PASSED
```

The ADK adapter tests invoke the real OneShot production provider resolver, persistent worker bridge, canonical Role runtime, HTTP server, artifact creation, Triple Validation, confirmation and hash workflow. The model response is supplied by `app/fixtures/provider/adk-research-draft.json` so the product integration can be tested deterministically without requiring a local model service in CI.

## Observed live server run in deterministic ADK adapter mode

```text
Researcher          PASSED
Planner             PASSED
Refactor            PASSED
GapAnalysis         PASSED
Evaluation          PASSED
SchemaValidation    VALID
FixtureValidation   VALID
GoalValidation      VALID
Confirmed           PASSED
CreateHash          PASSED
Hash                PASSED
Done                PASSED
```

Observed hash proof:

```text
created/recomputed equality: true
created_hash: 23434c38a34f5187e78d6d61ce1614b65a7c9076bc7e51fca31c34e6039e0c5d
```

## Live Google ADK → LiteLLM → Ollama → Gemma 2 proof

The target workstation executed `e2e/scripts/verify_adk_live.py` with fixture bypass disabled and returned:

```text
provider:          Google ADK → LiteLLM → Ollama
model:             gemma2:9b
run_id:            0e9e258e-db68-4e21-baeb-8f12a9bc8037
evidence records:  3
dependencies:      1
step edges:        1
fixture assertions:7
Schema:            VALID
Fixture:           VALID
Goal:              VALID
hash equality:     true
Done:              PASSED
created_hash:      c7cb883471f58552b3724bc6f60aed07112bfddbba9ef43f81e4af45e895114e
```

Recheck with:

```bash
python e2e/scripts/verify_adk_live.py
python backend/scripts/ollama_preflight.py
```

The live local-model boundary is accepted because the inference result traversed the production HTTP caller and canonical chain to `DONE PASSED`.

## Final stop condition

```text
PASSED
```
