# OneShot on Vercel — split deployment

Vercel hosts the static frontend export only. The stateful agent backend
(`backend/index.ts`: custom `node:http` server, AG-UI SSE, Python subprocess,
Redis/BullMQ, `.oneshot/` filesystem writes) cannot run on Vercel Serverless
Functions and must run on a persistent container/VM host.

## 1. Vercel project settings (dashboard)

- Root Directory: `frontend/web`
- Framework Preset: Next.js (static export)
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --prefix frontend/web run build`
  (use `pnpm run build` from repo root if Root Directory is repo root)
- Output Directory:
  - `dist` when Root Directory is `frontend/web`
  - `frontend/web/dist` when Root Directory is repo root
- Node.js: `22.x` (repo `engines` allows `22.x || >=24.21.0`)
- Env var: `NEXT_PUBLIC_BACKEND_URL=https://<backend-host>` (no trailing path)

`frontend/web/vercel.json` already pins the same install/build/output values for
repo-root imports. Do not add `rewrites` for `/api/*` on a static export: the
browser calls `NEXT_PUBLIC_BACKEND_URL` directly via `resolveApiUrl()`.

## 2. Backend host (container/VM, not Vercel)

Run `node dist/backend/index.js` with:

- `PORT`, `HOST`
- Provider keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`,
  `TAVILY_API_KEY`, `NEBIUS_API_KEY`
- `PYTHON_REASONING_URL=http://<python-svc>/v1/reason` (recommended)
- `ONESHOT_DISABLE_PYTHON_SPAWN=1` when Python CLI is unavailable
- `NODE_ENV=production` (disables `app/env/.env` file writes; runtime-only keys)
  - Local dev may set `ONESHOT_ALLOW_ENV_FILE_WRITE=1` to keep file persistence.
- `REDIS_URL` + persistent disk for `.oneshot/storage` (single replica unless
  sessions move to shared Redis/Postgres)
- `GOOGLE_OAUTH_REDIRECT_URI=https://<backend-host>/auth/callback`
- CORS: backend already sends `Access-Control-Allow-Origin: *`; restrict it per
  deployment if the frontend origin is fixed.

## 3. Local behavior unchanged

When `NEXT_PUBLIC_BACKEND_URL` is unset/empty, the frontend uses same-origin
relative URLs (`/api/health`, `/api/agent/stream`, `/api/v2/*`), preserving
`pnpm oneshot` and `next dev -p 5173` flows.
