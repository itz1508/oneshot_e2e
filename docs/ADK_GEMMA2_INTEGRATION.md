# Google ADK + Gemma 2 Local Integration

This package keeps the canonical OneShot workflow unchanged. Google ADK is used only inside the Researcher provider boundary; TypeScript continues to own workflow orchestration and canonical artifact assembly.

## Runtime path

```text
Prompt_id
→ ResearcherWorkflow (TypeScript)
→ AdkGemmaResearchProvider (TypeScript)
→ persistent ADK worker pool
→ Google ADK LlmAgent
→ LiteLLM
→ Ollama
→ gemma2:9b
→ structured research draft
→ deterministic ResearchBundle assembly
→ canonical JSON Schema validation
→ Planner → Refactor → Gap Analysis → Evaluation → Triple Validation → CONFIRMED → HASH → DONE
```

The ADK draft is not canonical workflow truth. Before inference, the TypeScript provider creates an approved evidence catalog from the durable work-order intent, requested outcome, and prompt-context records. Gemma may reference those records by index but cannot author their source or provenance. Invalid or unresolved evidence indexes terminate at the Researcher boundary.

Dependency meanings are separate:

- `dependencies[].requirement_indexes` maps dependency applicability to canonical requirement IDs.
- `plan_steps[].depends_on_step_indexes` maps execution order to prior canonical step IDs.

The TypeScript provider assigns fresh run-scoped IDs, maps both dependency domains, and creates job-specific assertions for every researched requirement, step description, and responsibility. The canonical plan schema remains the structural authority.

## Previous local performance profile retained

```text
model              gemma2:9b
Ollama              localhost:11434
context             8192
keep-alive          5m
parallel requests   2
cache               Redis localhost:6379/0
cache TTL           3600 seconds
```

`OLLAMA_CONTEXT_LENGTH=8192`, `OLLAMA_KEEP_ALIVE=5m`, and `OLLAMA_NUM_PARALLEL=2` are supplied in `config/local-ai.env.example` and the Docker Compose profile.

## Cache boundary

Redis caches only the non-canonical structured ADK research draft. The key contains the Gemma model and semantic prompt fields; run-specific prompt/context IDs are excluded.

```text
semantic prompt + model
→ ADK draft cache
→ fresh run-scoped canonical IDs
→ fresh Researcher artifacts
→ fresh validation
→ fresh confirmed core
→ fresh hash
```

If Redis is unavailable, the provider worker uses an in-process TTL cache with the same boundary.

## Install

Base deterministic runtime:

```bash
python scripts/bootstrap.py
```

ADK provider dependencies:

```bash
python scripts/bootstrap.py --with-adk
```

The ADK-specific pins are in `requirements/adk.txt`.

## Local services

```bash
docker compose -f deploy/docker/docker-compose.local-ai.yml up -d
ollama pull gemma2:9b
```

Then load `config/local-ai.env.example` into the environment and start OneShot.

```bash
npm start
```

## Live provider checks

```bash
python scripts/verify_adk_live.py
python scripts/ollama_preflight.py
```

`verify_adk_live.py` verifies exact ADK dependency availability, Ollama/model reachability, then starts the real OneShot production HTTP caller with fixture bypass disabled. It executes Google ADK → LiteLLM → Ollama → Gemma inference and requires evidence provenance, dependency edges, non-trivial fixtures, Triple Validation, hash equality, and `DONE PASSED`.

`GEMMA2_TIMEOUT_SECONDS` bounds the complete ADK inference operation through `asyncio.wait_for`. Expiry is returned through the normal provider boundary and becomes workflow `ROOT_CAUSE`.

When `ONESHOT_RESEARCH_PROVIDER=adk_gemma2`, `scripts/verify_dependencies.py` validates every exact pin in both `requirements/base.txt` and `requirements/adk.txt`.

## HTTP boundary hardening

The built-in server now supplies content-type/frame/referrer/permissions/CSP headers, configured CORS, bounded API request rate, and optional bearer-token protection through `ONESHOT_API_TOKEN`.

## Scaling material intentionally not activated

The provided Node cluster and Kubernetes HPA snippets are not active runtime configuration because the current `RunRepository`, SSE event subscriptions, and filesystem artifact storage are node-local. Horizontal scaling becomes useful after those three runtime surfaces are externalized/shared. This keeps the current product behavior correct instead of adding a scaling layer that would split run/event ownership.

## Official references

- Google ADK: https://google.github.io/adk-docs/
- Google ADK Python: https://github.com/google/adk-python
- Ollama API: https://docs.ollama.com/api/chat
- Ollama runtime/context configuration: https://docs.ollama.com/faq
