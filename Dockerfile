# syntax=docker/dockerfile:1
# OneShot Production Multi-Stage Dockerfile
FROM node:22-bookworm-slim AS node-builder
WORKDIR /app

# Install root dependencies
COPY package*.json tsconfig.json ./
COPY vendor ./vendor
RUN --mount=type=cache,target=/root/.npm \
    npm ci --offline --ignore-scripts --no-audit --no-fund

# Copy backend source and compile
COPY backend ./backend
RUN node node_modules/typescript/bin/tsc -p tsconfig.json

# Copy and build OneShot React IDE
COPY web ./web
RUN --mount=type=cache,target=/root/.npm \
    npm --prefix web ci --no-audit --no-fund && npm --prefix web run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install the supported Python runtime in an isolated environment.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Remove Node.js package-manager executables and their bundled dependencies
# (npm, npx, yarn, corepack) from the runtime image. The compiled backend
# (CMD ["node", "dist/backend/index.js"]) never invokes any of these tools;
# grep across backend/, validation/, skill/, workflow/ confirms zero
# references. This removes the npm-bundled tar@7.5.11 package, which is
# affected by CVE-2026-59873 (fixed upstream in tar 7.5.19), from the final
# image without patching nested files. Node.js itself is retained.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn-v*

# Install Python validation dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/oneshot-venv \
    && /opt/oneshot-venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy compiled backend and React IDE assets
COPY package*.json ./
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/web/dist ./web/dist
COPY schema ./schema
COPY validation ./validation
COPY skill ./skill
COPY workflow ./workflow
COPY fixtures ./fixtures
COPY ui ./ui
COPY contract-registry.json CANONICAL_WORKFLOW.md ./

# Run with a writable data boundary and no root privileges.
RUN groupadd --gid 10001 oneshot \
    && useradd --uid 10001 --gid oneshot --create-home --shell /usr/sbin/nologin oneshot \
    && mkdir -p data/runs data/run-state data/task-events data/checkpoints data/conversations data/sandbox-workspaces \
    && chown -R oneshot:oneshot /app/data

ENV PATH=/opt/oneshot-venv/bin:$PATH
ENV ONESHOT_ROOT=/app
ENV ONESHOT_WORKSPACE_ROOT=/app
ENV ONESHOT_BIND_HOST=0.0.0.0
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const h=process.env.ONESHOT_API_TOKEN?{Authorization:'Bearer '+process.env.ONESHOT_API_TOKEN}:{};fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{headers:h}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

USER oneshot:oneshot
CMD ["node", "dist/backend/index.js"]
