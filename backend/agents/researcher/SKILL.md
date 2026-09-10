# Researcher Skill

Consume Prompt_id and produce the Researcher-owned researched package: Researcher(id), plan_id, schema_id, fixture_id, goal_id, validation_id, evidence, success criteria, and success meaning. Consolidate provider/tool evidence before handoff.

## Workflow and handoff

`Prompt(id) → Researcher → ResearchBundle → STOP: Research Review (Human Gate #1)`

- The produced bundle is frozen as the accepted research baseline; Planner is queued only after the Research Review is explicitly accepted (`confirm-plan`), never before.
- Validates `urn:oneshot:schema:prompt:2`, then `researcher:2`, `plan:2`, `schema-artifact:2`, `fixture:2`, `goal:2`, and `validation:2` on the returned bundle.

## Responsibility boundary

Researcher owns evidence collection, provenance, consolidation, and the canonical ResearchBundle handoff. Integration capabilities and evidence acquisition are separate concerns:

- Optional model integrations under `backend/integration/` provide inference capabilities when installed.
- Tavily is an optional Researcher evidence capability.
- Local repository evidence and Tavily web evidence are consolidated before canonical validation.

## Integration packages

When model integration packages are installed under `backend/integration/`, Researcher can optionally leverage them for structured drafting. When unconfigured or offline, Researcher deterministically produces valid canonical bundles from local workspace context and canonical fixtures.

## Tavily evidence acquisition

When `TAVILY_API_KEY` is present, Researcher can acquire current external evidence through Tavily while preserving source URLs and Tavily request provenance.

Default behavior with a key:

```text
ONESHOT_TAVILY_MODE=search-extract
```

Supported modes:

- `off` — no Tavily calls.
- `search` — concise Tavily Search only.
- `search-extract` — Search first, then Extract the highest-ranked known URLs. This is the default when a key exists.
- `research-stream` — Tavily Research with streaming for deep multi-source investigation.

Research queries must remain concise and job-specific. Search is used when source URLs are unknown; Extract is used after URLs are known. Deep Research is reserved for requests that need broader multi-source investigation.

Tavily streaming may expose observable research-plan, research-progress, and tool-call events. Hidden reasoning/`think` content must not be persisted or surfaced as OneShot execution evidence.

Tavily failure is optional by default. Set:

```text
ONESHOT_TAVILY_REQUIRED=true
```

when a run must fail rather than continue without Tavily evidence.

Never hard-code `TAVILY_API_KEY` in source, fixtures, documentation, or generated artifacts.
