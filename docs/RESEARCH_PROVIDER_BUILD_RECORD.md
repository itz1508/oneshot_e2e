# ResearchProvider Binding Build Record

Last updated: 2026-08-31

## Objective

Bind real model inference only at the existing Researcher provider seam:

```text
Prompt(id)
→ Researcher
→ ResearchProvider
   ├─ DEFAULT: Google ADK → LiteLLM → Ollama → Gemma 2
   └─ OPTION: Featherless → google/gemma-4-31B-it
→ valid ResearchBundle / Researcher(id)
→ existing workflow unchanged
```

## Scope boundary

The implementation does not modify Intent, Planner, Refactor, Gap Analysis,
Evaluation, Triple Validation, hash creation/comparison, Task Management,
sandbox execution, or the IDE structure. Both providers still implement the
existing `research(prompt, runId): Promise<ResearchBundle>` contract.

Provider SDK response types stop at the ResearchProvider boundary. A shared,
provider-local converter creates the same canonical `ResearchBundle` previously
created by the local ADK provider. Featherless lifecycle events use the existing
`SUPPORT` scope, not `WORKFLOW` or `ADK`.

## Implemented state

- Production default is local `adk_gemma2`; no selection variable is required.
- `ONESHOT_RESEARCH_PROVIDER=featherless` selects the optional remote adapter.
- Local default remains `gemma2:9b` through Google ADK, LiteLLM, and Ollama.
- Featherless default is `google/gemma-4-31B-it` through its OpenAI-compatible
  `POST /v1/chat/completions` endpoint.
- `FEATHERLESS_API_KEY` is read only by the backend Python worker. No frontend
  field, response, log, or source file contains the credential.
- The remote model response is validated with a strict Pydantic schema before
  conversion to OneShot Researcher content.
- Provider failures become the existing `WorkflowRootCauseError` format.
- Worker pools provide request distribution within each configured backend
  process. Broader subscription, billing, and cross-instance load balancing are
  intentionally outside this narrowed binding task.
- Token streaming is not introduced in this slice. Existing OneShot processing
  event streaming remains unchanged.

## Files

- `backend/role/researcher/provider-resolver.ts`: production selection and local
  default.
- `backend/role/researcher/provider/structured-draft.ts`: shared validated draft
  to canonical `ResearchBundle` conversion.
- `backend/role/researcher/provider/adk-gemma2/provider.ts`: local provider now
  uses the shared conversion without changing its runtime path.
- `backend/role/researcher/provider/featherless/`: remote provider, worker bridge,
  strict schema, and actual OpenAI-compatible inference call.
- `app/config/featherless.env.example`: secret-free backend configuration template.
- `app/requirements/featherless.txt`: exact OpenAI Python SDK pin.
- `e2e/scripts/verify_featherless_live.mjs`: explicit real-inference proof for the
  immediate Prompt-to-Researcher boundary.
- `tests_ts/featherless-provider.test.ts`: deterministic full-chain boundary and
  missing-auth failure tests.

## Verification record

Verified on 2026-08-31:

```text
npm run build                                      PASSED
python -m py_compile .../featherless/worker.py    PASSED
python app/scripts/verify_dependencies.py --profile featherless
                                                   PASSED
npm run verify:featherless-adapter                 2 passed
npm run verify:adk-adapter                         1 passed
npm test                                           44 passed, 0 failed
python app/scripts/verify_all.py                       42 Python + 44 TypeScript passed
```

The deterministic tests prove provider selection, the Python worker bridge,
strict draft validation, Prompt/Researcher identity, canonical downstream
compatibility, hash equality, and unchanged completion of the existing chain.

Real-inference status on this machine at the recorded time:

- Ollama was reachable, but its model list was empty; `gemma2:9b` was not
  installed.
- `FEATHERLESS_API_KEY` was not configured.
- Therefore no honest live-model success claim is recorded yet.

## Live completion commands

Default local path:

```powershell
ollama pull gemma2:9b
python e2e/scripts/verify_adk_live.py
```

Optional Featherless path (set the key outside source control):

```powershell
$env:FEATHERLESS_API_KEY="<secret>"
npm run verify:featherless-live
```

The Featherless live command prints only provider identity, OneShot IDs, and
validated object counts; it does not print the key or model-generated content.

## Authoritative references

- Featherless quickstart and OpenAI-compatible client configuration:
  https://featherless.ai/docs/quickstart-guide
- Featherless chat-completions contract:
  https://featherless.ai/docs/completions
- Featherless model identifier:
  https://featherless.ai/models/google/gemma-4-31B-it
- OpenAI Python SDK custom `base_url` support:
  https://github.com/openai/openai-python
- Pydantic JSON Schema and validation:
  https://docs.pydantic.dev/latest/concepts/json_schema/
- Google ADK documentation:
  https://google.github.io/adk-docs/

## Resume point

No provider code remains pending. To close the only unverified requirement,
configure one real runtime path and run its live proof command. Do not mark real
inference complete from deterministic adapter tests alone.
