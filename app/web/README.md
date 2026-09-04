# OneShot Staging Frontend

Local staging frontend built from the approved OneShot UI. It is intentionally standalone and does not modify any backend repository.

## Known OneShot browser contracts

- `GET /api/health`
- `POST /api/conversations`
- `POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/prompt`
- `POST /api/conversations/:id/run`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events` (SSE)
- `GET /v1/workspace/tree?path=.&depth=3`
- `GET /v1/workspace/file?path=...`

Authentication supports same-origin browser sessions and an optional `ONESHOT_API_TOKEN` Bearer token stored only in `sessionStorage`. No login/csrf endpoint is invented.

Generate readiness is runtime-owned. Message text alone never enables Generate. Run Context is rendered only from context fields actually present in the real run snapshot.

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm start
```
