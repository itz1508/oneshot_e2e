#!/usr/bin/env bash
# ==============================================================================
# OneShot Production 1.3.0 - Stop Script (macOS / Linux)
# ==============================================================================
set -e

echo "[INFO] Stopping OneShot container and freeing resources..."
docker compose down
echo "[OK] OneShot stopped successfully."
