# OneShot multi-stage runtime with Google ADK TypeScript workflow support
FROM node:24.13.0-slim AS node-builder
WORKDIR /app

# Install root runtime + build dependencies. @google/adk is a registry package;
# the old offline vendor directory does not contain its dependency closure.
COPY package*.json tsconfig.json ./
COPY vendor ./vendor
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy backend source and compile
COPY backend ./backend
RUN npx tsc -p tsconfig.json

# Copy and build OneShot React IDE
COPY web ./web
RUN cd web && npm ci --no-audit --no-fund && npm run build

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

# Copy compiled backend and React IDE assets
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/web/dist ./web/dist
COPY schema ./schema
COPY validation ./validation
COPY workflow ./workflow
COPY skill ./skill
COPY ui ./ui
COPY contract-registry.json CANONICAL_WORKFLOW.md LICENSE NOTICE ./

# Create durable/evidence directories
RUN mkdir -p data/runs data/run-state data/task-events data/checkpoints data/conversations data/sandbox-workspaces

ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "dist/backend/index.js"]
