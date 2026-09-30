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

# The Python interpreter lives at a stable, explicit path so the runtime
# stage can carry it alongside the venv. A venv is NOT self-contained:
# uv's managed CPython links against libpython inside this directory, so
# copying .venv without /opt/python leaves backend/python/.venv/bin/python
# dangling (resolvePythonBinary() -> existsSync false -> bare `python`).
# `only-managed` stops uv silently adopting a distro interpreter.
ENV UV_PYTHON_INSTALL_DIR=/opt/python
ENV UV_PYTHON_PREFERENCE=only-managed
# Keep the [dependency-groups] dev tools (pytest/ruff/httpx) out of the
# production image.
ENV UV_NO_DEV=1

RUN uv python install 3.12

WORKDIR /app

# Dependency manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/web/package.json frontend/web/
COPY packages/agent-runtime/package.json packages/agent-runtime/
# Each integration package must land at its real path, because
# pnpm-workspace.yaml declares the `app/integration/*` glob and resolves
# those importer keys straight out of pnpm-lock.yaml.
#
# `COPY app/integration/*/package.json app/integration/*/` does NOT work: Docker
# expands wildcards in the SOURCE only, never in the destination. It creates one
# directory literally named `*` and collapses all four package.json files into
# it (last one alphabetically wins). pnpm then discovers a single unexpected
# workspace project and fails with ERR_PNPM_OUTDATED_LOCKFILE ("1 dependencies
# were added"), while Gemini/OpenAI/Strands silently vanish from the image.
# Copying the directory keeps every package at its real path and stays correct
# when a fifth integration is added. .dockerignore keeps
# app/integration/*/node_modules out of the context, so this stays small.
COPY app/integration/ app/integration/
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

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/web/dist ./frontend/web/dist
# Deliberately no `apt-get install python3`: bookworm only ships 3.11 (below
# the pyproject `requires-python = ">=3.12"` contract) and provides no
# unversioned `python`, so a broken venv lookup would degrade into an ENOENT
# spawn rather than an obvious error. The managed interpreter below is the
# only one this image needs, and it must land at the exact absolute path it
# was installed to: backend/python/.venv/bin/python and pyvenv.cfg's `home`
# both point into /opt/python, and Docker COPY does not follow symlinks out
# of the copied tree.
COPY --from=builder /opt/python /opt/python
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
