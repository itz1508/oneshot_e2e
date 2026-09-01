#!/usr/bin/env bash
# ==============================================================================
# OneShot Production 1.3.0 - Stop Script (macOS / Linux)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.yml"
if [ -f "$SCRIPT_DIR/docker-compose.judge.yml" ]; then
    COMPOSE_FILE="docker-compose.judge.yml"
fi

echo "[INFO] Stopping OneShot container ($COMPOSE_FILE) and freeing resources..."
docker compose -f "$COMPOSE_FILE" down
echo "[OK] OneShot stopped successfully."
