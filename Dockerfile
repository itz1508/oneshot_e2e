# OneShot Production Multi-Stage Dockerfile
FROM node:20-slim AS node-builder
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY vendor ./vendor
RUN npm ci --offline --ignore-scripts --no-audit --no-fund

COPY backend ./backend
RUN npm run build

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

# Copy compiled backend and frontend assets
COPY package*.json ./
COPY --from=node-builder /app/dist ./dist
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
