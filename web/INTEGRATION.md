# Integration map

| UI surface | Existing OneShot runtime source |
|---|---|
| Connectivity/provider label | `GET /api/health` |
| Conversation creation | `POST /api/conversations` |
| Conversation continuation | `POST /api/conversations/:id/messages` |
| Insufficient-information/prompt readiness | `POST /api/conversations/:id/prompt` |
| Readiness + Generate | conversation/intent response; frontend never derives readiness from textarea content |
| Run creation | `POST /api/conversations/:id/run` |
| Run snapshot/result/hash proof | `GET /api/runs/:id` |
| Task stages/events | ordered/deduplicated `GET /api/runs/:id/events` SSE |
| Researcher activity | exposed SSE `activity` only |
| Run Context | context fields actually present in the run snapshot; no invented context endpoint |
| Workspace tree/file | `/v1/workspace/*` |
| Authentication | existing same-origin session or Bearer token; no invented auth route |
