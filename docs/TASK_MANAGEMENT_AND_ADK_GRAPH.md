# Task Management and Runtime Graphs

Task Management is an observation/recovery-metadata layer around the canonical OneShot runtime. It does not own Role execution, validation, confirmation, or hashing.

## Task Management

It persists append-only processing events with:

- monotonic sequence
- duplicate-event rejection
- correlation and causation IDs
- W3C trace context
- artifact references
- checkpoint metadata
- replayable run projections
- audit projection and canonical ordering checks
- support events such as targeted HelpRequest metadata

All Task data remains outside `confirmed_package.core`.

## Google ADK Researcher graph

```text
Researcher Provider
→ Research Draft Cache
  ├─ hit → Structured Research Draft
  └─ miss → Google ADK LlmAgent / Runner
           → LiteLLM ollama_chat
           → Ollama
           → Gemma 2 9B
           → Structured Research Draft
```

The graph is projection-only and cannot authorize canonical workflow transitions.

## Authority graph

A second projection maps actual processors to authority, responsibility, Skill, Tool, capability/provider, and artifact output. Schema, Fixture, and Goal validation remain independent and join at explicit `TripleValidation`.

## Read APIs

- `GET /api/runs/:run_id/task`
- `GET /api/runs/:run_id/audit`
- `GET /api/runs/:run_id/events`
- `GET /api/graphs/adk`
- `GET /api/runs/:run_id/adk-graph`
- `GET /api/graphs/authority`
- `GET /api/runs/:run_id/authority-graph`
