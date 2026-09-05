# OneShot multi-stage runtime with Google ADK TypeScript workflow support
FROM node:24.13.0-slim AS node-builder
WORKDIR /app

# Install root runtime + build dependencies. @google/adk is a registry package;
# the old offline vendor directory does not contain its dependency closure.
COPY package*.json tsconfig.json ./
COPY app/vendor ./app/vendor
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy backend source and compile
COPY backend ./backend
RUN npx tsc -p tsconfig.json

# Copy and build OneShot Web IDE
COPY app/web ./app/web
RUN cd app/web && npm ci --no-audit --no-fund && npm run build

# Prune development dependencies for minimal runner footprint
RUN npm prune --omit=dev --no-audit --no-fund

FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

# Use the exact supported Node runtime from the Node build stage instead of the
# older Debian nodejs package.
COPY --from=node-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=node-builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version \
    && npm --version

# Install Python deterministic validation dependencies
COPY app/requirements ./app/requirements
RUN pip install --no-cache-dir -r app/requirements/base.txt

# Runtime dependencies are required because the compiled backend imports
# @google/adk at execution time.
COPY package*.json ./
COPY --from=node-builder /app/node_modules ./node_modules

# Copy compiled backend and Web IDE assets
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/app/web/dist ./app/web/dist
# Schema, Python validation package, reusable skills, and workflow live under backend/
COPY backend ./backend
# Deterministic fixture provider reads the canonical seed bundle at app/fixtures/
COPY app/fixtures ./app/fixtures
# Third-party and platform legal notices
COPY app/legal ./app/legal
COPY app/contract-registry.json ./app/contract-registry.json
COPY docs/Project.Workflow.md ./docs/Project.Workflow.md
COPY docs/license/LICENSE docs/license/NOTICE ./docs/license/

# Python import roots: `validation` lives at backend/validation/python; `workspace_api` lives at app
ENV PYTHONPATH=/app/backend/validation/python:/app/app

# Create durable/evidence directories
RUN mkdir -p .runtime/runs .runtime/run-state .runtime/task-events .runtime/checkpoints .runtime/conversations .runtime/sandbox-workspaces .runtime/cache .runtime/uploads .runtime/qc

# Provider credentials never live in the image or the mounted workspace.
# Mount a docker secret and point ONESHOT_SECRETS_DIR at it, e.g.:
#   docker run --mount type=bind,src=/var/lib/oneshot/secrets,dst=/secrets \
#     -e ONESHOT_SECRETS_DIR=/secrets -p 8787:8787 oneshot:local
# Web-submitted credentials land in the directory above (never web-served).

ENV ONESHOT_BIND_HOST=0.0.0.0
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "dist/backend/index.js"]
