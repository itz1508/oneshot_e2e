# app/web Agent Guidance

This is the OneShot browser UI. It is a Next.js Pages Router application that
exports to static HTML and is served by the Node backend.

- Source lives under `src/`.
- Pages Router: `src/pages/`.
- Global styles: `src/styles/globals.css`.
- Feature CSS modules: `src/components/<feature>/<feature>.module.css`.
- HTTP client: `src/lib/http-client.ts`, events: `src/lib/event-stream.ts`.
- API projections: `src/lib/contracts.ts` and `src/lib/projections.ts`.
- Public API surface re-exported from `src/lib/api.ts`.

Build commands:
- `npm run typecheck`
- `npm run build` (static export into `dist/`)
- `npm run preview` (serve `dist/` and proxy `/api`, `/v1`)

Do not introduce App Router `app/`. Do not add browser login/session UI; auth
is handled by backend security.
