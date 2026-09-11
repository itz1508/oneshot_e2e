# OneShot Web Application

Browser code lives under `src/`. Server-side provider integrations live under [`cloud/`](cloud/README.md) and are compiled by the root backend build. The frontend asset build does not copy cloud source or credentials into `dist/`.

The backend serves the built UI from `app/web/dist` and supplies the HTTP and SSE endpoints below.

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

The web app talks to the OneShot server same-origin; no OneShot-issued token, login, or credential is involved.

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
