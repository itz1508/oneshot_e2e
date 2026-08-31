# Intent Collection, Authority Trace, and Help Requests

## Intent boundary

Chat remains the user interaction surface. Intent Collection is a support layer before the canonical workflow:

```text
Chat turns
→ same logical Intent(id), increasing revision
→ required-information check
   ├─ missing → ROOT CAUSE + targeted help request → user answer → same Intent(id), new revision
   └─ sufficient → Prompt(id)
→ Researcher
```

Intent Collection never creates `plan_id` and never invokes Planner directly.

Each Intent keeps source turn IDs for provenance. Readiness is determined by required information being resolved; no percentage threshold authorizes workflow execution.

## Help request boundary

A help request is support metadata outside `confirmed_package.core`.

```text
ROOT CAUSE
├── issue
├── expected
├── actual
├── evidence_ids
├── required_correction
└── recheck_target

help_request
├── request_id
├── reason
├── question
├── required_information[]
├── source_processor
├── intent_id / conversation_id when applicable
└── prompt_revision_required
```

No random fix, retry loop, or automatic user-information fabrication is allowed. When the missing fact is user-owned, the system asks the smallest targeted question and re-enters through Intent/Prompt revision.

## Authority trace

The authority graph is projection-only and is derived from the real runtime event stream plus the responsibility catalog. It exposes:

```text
processor
→ authority/owner
→ responsibility
→ Skill
→ Tool
→ capability/provider
→ input
→ output/artifact reference
```

The validation branch is represented as three independent proofs joining at `TripleValidation`.

## APIs

- `POST /api/conversations`
- `POST /api/conversations/:conversation_id/messages`
- `GET /api/conversations/:conversation_id`
- `POST /api/conversations/:conversation_id/prompt`
- `POST /api/conversations/:conversation_id/run`
- `GET /api/conversations/:conversation_id/graph`
- `GET /api/graphs/authority`
- `GET /api/runs/:run_id/authority-graph`
