# OneShot Production Multi-Stage Dockerfile
FROM node:20-slim AS node-builder
WORKDIR /app

# Install root dependencies
COPY package*.json tsconfig.json ./
COPY vendor ./vendor
RUN npm ci --offline --ignore-scripts --no-audit --no-fund

# Copy backend source and compile
COPY backend ./backend
RUN npx tsc -p tsconfig.json

# Copy and build OneShot React IDE
COPY web ./web
RUN cd web && npm ci --no-audit --no-fund && npm run build

FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

# Install Node.js runtime in python container
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python validation dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy compiled backend and React IDE assets
COPY package*.json ./
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/web/dist ./web/dist
COPY schema ./schema
COPY validation ./validation
COPY skill ./skill
COPY ui ./ui
COPY contract-registry.json CANONICAL_WORKFLOW.md ./

# Create data directories
RUN mkdir -p data/runs data/run-state data/task-events data/checkpoints data/conversations data/sandbox-workspaces

ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "dist/backend/index.js"]
