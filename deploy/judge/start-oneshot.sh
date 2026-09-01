#!/usr/bin/env bash
# ==============================================================================
# OneShot Production 1.3.0 - Judge Quick-Start Launcher (macOS / Linux)
# ==============================================================================
set -e

PORT="${PORT:-8787}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

echo ""
echo "================================================================="
echo "  OneShot Production E2E 1.3.0 - Judge Quick-Start Launcher"
echo "================================================================="
echo ""

# 1. Check Docker CLI
if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Docker CLI not found. Please install Docker Desktop or Engine."
    echo "        Visit: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# 2. Check Docker Daemon
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon is not running. Please start Docker and retry."
    exit 1
fi

# 3. Generate or load token
TOKEN=""
if [ -f "$ENV_FILE" ]; then
    TOKEN=$(grep -E '^\s*ONESHOT_API_TOKEN\s*=' "$ENV_FILE" | cut -d '=' -f2- | tr -d ' "')
fi

if [ -z "$TOKEN" ]; then
    echo "[INFO] Generating cryptographically secure local OneShot token..."
    if command -v openssl >/dev/null 2>&1; then
        TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
    else
        TOKEN=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')
    fi
    
    if [ -f "$ENV_FILE" ]; then
        echo "ONESHOT_API_TOKEN=$TOKEN" >> "$ENV_FILE"
    else
        cat <<EOF > "$ENV_FILE"
ONESHOT_API_TOKEN=$TOKEN
ONESHOT_BIND_HOST=0.0.0.0
PORT=$PORT
EOF
    fi
fi

export ONESHOT_API_TOKEN="$TOKEN"
export PORT="$PORT"

# 4. Check for local image tarball
TAR_PATH="$SCRIPT_DIR/oneshot-1.3.0.tar.gz"
if [ -f "$TAR_PATH" ]; then
    echo "[INFO] Loading offline prebuilt Docker image: oneshot:1.3.0..."
    docker load -i "$TAR_PATH"
fi

# 5. Launch Container via Docker Compose
echo "[INFO] Launching OneShot via Docker Compose..."
docker compose up -d

# 6. Wait for healthcheck
URL="http://localhost:$PORT"
echo -n "[INFO] Waiting for OneShot container to reach healthy status..."

MAX_ATTEMPTS=30
HEALTHY=false
for i in $(seq 1 $MAX_ATTEMPTS); do
    sleep 1
    echo -n "."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$URL/api/health" 2>/dev/null || true)
    if [ "$STATUS" = "200" ]; then
        HEALTHY=true
        break
    fi
done
echo ""

if [ "$HEALTHY" != "true" ]; then
    echo "[WARNING] Healthcheck timed out. Displaying recent logs:"
    docker compose logs --tail 20
fi

# 7. Print Completion Banner
echo ""
echo "================================================================="
echo "  OneShot Platform is Running and Ready for Evaluation!"
echo "================================================================="
echo ""
echo "  IDE URL:      $URL"
echo "  Access Token: $TOKEN"
echo ""
echo "  * The token has been saved to your local .env file."
echo "  * To stop the container, run: ./stop-oneshot.sh (or docker compose down)"
echo "================================================================="
echo ""

# 8. Open browser
if [ -z "$NO_BROWSER" ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$URL" >/dev/null 2>&1 &
    fi
fi
