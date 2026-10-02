# OneShot on Vercel — split deployment

Vercel hosts the static frontend export only. The stateful agent backend
(`backend/index.ts`: custom `node:http` server, AG-UI SSE, Python subprocess,
Redis/BullMQ, `.oneshot/` filesystem writes) cannot run on Vercel Serverless
Functions and must run on a persistent container/VM host.

## 1. Vercel project settings (dashboard)

Vercel reads `vercel.json` from the project's **Root Directory**, so both
layouts are supported and each pins its own install/build/output values:

| Vercel Root Directory | Config file read | Install | Build | Output |
| :--- | :--- | :--- | :--- | :--- |
| repository root (empty) | `vercel.json` | `pnpm install --frozen-lockfile` | `node scripts/check-vercel-env.mjs && pnpm --prefix frontend/web run build` | `frontend/web/dist` |
| `frontend/web` | `frontend/web/vercel.json` | `cd ../.. && pnpm install --frozen-lockfile` | `pnpm run build` | `dist` |

Leave Install / Build / Output blank in the dashboard for either layout: the
committed `vercel.json` for that Root Directory takes precedence. Do **not** drop
`--frozen-lockfile` from either install command — the only lockfile is at the repo
root, so a plain install would resolve fresh versions.

`scripts/check-vercel-env.mjs` runs first at the repo-root layout. It fails with
an actionable message — instead of Vercel's bare `Exited with status 1` — when
the Node.js version is below `24.21.0` or when the layout is wrong. Note that the
repo-root build script is frontend-only: it never runs `build:backend`/`tsc`, so
the serverless container does not compile the Node backend.

- Root Directory: **repository root** *or* **`frontend/web`** — both work
- Framework Preset: Next.js (static export) at `frontend/web`; at the repo root
  `vercel.json` pins `framework: null` so no framework is detected and the static
  export is served as-is
- Node.js: `>=24.21.0` — all eight workspace manifests enforce it and CI pins
  `24.21.0`. Vercel resolves this from `engines.node` in `package.json` and
  ignores `.nvmrc`/`.node-version`; set **Settings → Build and Deployment →
  Node.js Version** to **24.x** if a project still builds on an older image
- Env var: `NEXT_PUBLIC_BACKEND_URL=https://<backend-host>` (no trailing path)
- Env var: `NEXT_PUBLIC_BACKEND_URL=https://<backend-host>` (no trailing path)

> **`NEXT_PUBLIC_*` is inlined at build time.** Next.js substitutes it into the
> client bundle during `next build`. Changing the backend URL therefore requires
> a **rebuild**, not just a redeploy of the static output. Treat it as a build
> input, not a runtime environment variable.

Do not add `rewrites` for `/api/*` on a static export: the browser calls
`NEXT_PUBLIC_BACKEND_URL` directly via `resolveApiUrl()`.

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
