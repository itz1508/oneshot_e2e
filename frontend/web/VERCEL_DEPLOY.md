# OneShot on Vercel — split deployment

Vercel hosts the static frontend export only. The stateful agent backend
(`backend/index.ts`: custom `node:http` server, AG-UI SSE, Python subprocess,
Redis/BullMQ, `.oneshot/` filesystem writes) cannot run on Vercel Serverless
Functions and must run on a persistent container/VM host.

## 1. Vercel project settings (dashboard)

- Root Directory: **`frontend/web`** — this is the only supported layout
- Framework Preset: Next.js (static export)
- Install / Build / Output: leave blank; `frontend/web/vercel.json` pins them

`frontend/web/vercel.json` is only ever read when the Root Directory is
`frontend/web`, so its values are written for that location:

| Setting | Value | Why |
| :--- | :--- | :--- |
| `installCommand` | `cd ../.. && pnpm install --frozen-lockfile` | The only lockfile is at the repo root; `--frozen-lockfile` is kept so versions are reproducible. Do **not** drop this override — with no lockfile in this directory, a plain install would resolve fresh versions. |
| `buildCommand` | `pnpm run build` | Runs `next build --webpack && node scripts/export.mjs` from `frontend/web`. |
| `outputDirectory` | `dist` | `next.config.ts` sets `output: "export"`, `distDir: "dist"`, and `export.mjs` writes a relative `dist`. |

If your Vercel project uses the repo root as its Root Directory instead, this
file is **not read** — set Install/Build/Output on the dashboard
(`pnpm run build` from root, output `frontend/web/dist`).

- Node.js: `>=24.21.0` — all eight workspace manifests enforce it and CI pins `24.21.0` (see the `AGENTS.md` engines note)
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
