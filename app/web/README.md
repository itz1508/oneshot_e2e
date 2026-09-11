# OneShot Web Application

The canonical browser application is the Next.js/React UI in `app/`, `components/`, and `lib/`.

- `app/` owns the Next.js application shell and global styles.
- `components/` owns the OneShot workspace and reusable UI components.
- `lib/` owns browser contracts, API helpers, event streaming, and projections.
- `cloud/` contains server-side provider integration code compiled by the root backend build; it is not copied into browser assets.
- `scripts/export.mjs` exports the Next build into `dist/`.
- `scripts/serve.mjs` serves `dist/` for the standalone web process.

The backend also serves the built UI from `app/web/dist`.

## Browser contracts

- `GET /api/health`
- `POST /api/conversations`
- `POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/prompt`
- `POST /api/conversations/:id/run`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events` (SSE)
- `GET /api/integrations`
- `POST /api/integrations/:id/install`
- `POST /api/integrations/:id/configure`
- `GET /v1/workspace/tree?path=.&depth=3`
- `GET /v1/workspace/file?path=...`

The web app talks to the OneShot server same-origin. Generate readiness is runtime-owned; message text alone never enables Generate.

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm start
```
