# OneShot production image — Option 2: single all-in-one container.
#
# The backend (backend/index.ts, plain node:http on HOST/PORT) serves the
# static frontend export (frontend/web/dist) itself, so one container owns
# the whole app on a single port. Python reasoning runs as an in-process
# CLI subprocess via backend/python/.venv — no sidecar needed by default.
#
# Optional local LLM: compose profile `local-llm` adds an Ollama sidecar
# (see docker-compose.yml). This image never pulls models; that happens
# at runtime in the sidecar volume.
#
# Toolchain pins (AGENTS.md): Node >=24.21.0, pnpm >=11.27.1, Python 3.12+.

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.27.1 --activate

# uv for the Python reasoning env (backend/python: pyproject declares,
# uv.lock pins, `uv sync --frozen` creates .venv).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Dependency manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/web/package.json frontend/web/
COPY packages/agent-runtime/package.json packages/agent-runtime/
COPY app/integration/*/package.json app/integration/*/
COPY backend/python/pyproject.toml backend/python/uv.lock backend/python/

RUN pnpm install --frozen-lockfile
RUN uv sync --frozen --project backend/python

# Sources needed by `pnpm run build` (backend tsc + Next.js static export).
COPY tsconfig.json tsconfig.build.json config.toml ./
COPY backend/ backend/
COPY packages/ packages/
COPY frontend/web/ frontend/web/
COPY app/scripts/ app/scripts/
COPY scripts/check-ui-build.mjs scripts/

RUN pnpm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

# Python 3.12 for the reasoning subprocess (backend/python-runtime.ts
# spawns backend/python/.venv/.../python; falls back to bare `python`).
RUN apt-get update && apt-get install -y --no-install-recommends python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/web/dist ./frontend/web/dist
COPY --from=builder /app/backend/python ./backend/python
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/frontend/web/node_modules ./frontend/web/node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/app/scripts ./app/scripts
COPY --from=builder /app/scripts/check-ui-build.mjs ./scripts/check-ui-build.mjs
COPY package.json config.toml ./

# NEVER copy app/env/.env into the image. Secrets arrive via
# `env_file` / `-e` at run time (see docker-compose.yml). The backend
# reads them from the environment; NODE_ENV=production disables .env
# file writes (runtime-only keys).

VOLUME ["/app/.oneshot/storage"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/backend/index.js"]
