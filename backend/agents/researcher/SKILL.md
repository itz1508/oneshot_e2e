# Researcher Skill

Consume Prompt_id and produce the Researcher-owned researched package: Researcher(id), plan_id, schema_id, fixture_id, goal_id, validation_id, evidence, success criteria, and success meaning. Consolidate provider/tool evidence before handoff.

## Responsibility boundary

Researcher owns evidence collection, provenance, consolidation, and the canonical ResearchBundle handoff. Provider selection and evidence acquisition are separate concerns:

- `ONESHOT_RESEARCH_PROVIDER` selects the model/provider used to create the structured research draft.
- Tavily is an optional Researcher evidence capability and never replaces or silently changes the configured Researcher provider.
- Local repository evidence and Tavily web evidence are consolidated before provider synthesis and canonical validation.

## Provider integration

Production supports the configured Researcher provider, including Featherless and the Google ADK + native Gemini pipeline. The compatibility provider identifier `adk_gemma2` remains accepted for the Google ADK pipeline.

Examples:

```text
ONESHOT_MODE=production
ONESHOT_RESEARCH_PROVIDER=featherless
```

or:

```text
ONESHOT_MODE=production
ONESHOT_RESEARCH_PROVIDER=adk_gemma2
```

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
