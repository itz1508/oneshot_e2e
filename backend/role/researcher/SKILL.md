# Researcher Skill

Consume Prompt_id and produce the Researcher-owned researched package: Researcher(id), plan_id, schema_id, fixture_id, goal_id, validation_id, evidence, success criteria, and success meaning. Consolidate provider/tool evidence before handoff.

## Provider integration

The Researcher provider boundary supports the deterministic fixture provider and the Google ADK + local Gemma 2 provider. ADK/Gemma returns a structured research draft; Researcher converts that draft into the canonical ResearchBundle and validates every Researcher-owned artifact before Planner handoff.

Provider selection:

```text
ONESHOT_MODE=production
ONESHOT_RESEARCH_PROVIDER=adk_gemma2
```
