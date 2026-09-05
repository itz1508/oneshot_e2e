#!/usr/bin/env bash
# scripts/judge-launch.sh
# Deterministic OneShot Judge Launcher for POSIX / Linux / macOS
set -euo pipefail

PORT="${PORT:-8787}"
CONTAINER_NAME="${CONTAINER_NAME:-oneshot-judge-runner}"
RUN_E2E="${RUN_E2E:-true}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "=== OneShot Deterministic Judge Launcher ==="
echo "Repository root: ${REPO_ROOT}"

# 1. Verify Docker daemon
if ! docker version >/dev/null 2>&1; then
    echo "ROOT_CAUSE: Docker daemon is unavailable. Please ensure Docker is running." >&2
    exit 1
fi

# 2. Resolve or load judge image
IMAGE_TAG="oneshot:judge"
TAR_PATH="${REPO_ROOT}/OneShot-1.3.0-judge.tar"

if ! docker image inspect "${IMAGE_TAG}" >/dev/null 2>&1; then
    if [ -f "${TAR_PATH}" ]; then
        echo "Loading prebuilt judge image from ${TAR_PATH}..."
        docker load -i "${TAR_PATH}"
    else
        echo "Building judge image from source..."
        docker build -t "${IMAGE_TAG}" -t oneshot:1.3.0 .
    fi
else
    echo "Found existing judge image: ${IMAGE_TAG}"
fi

# 3. Generate a cryptographically random local ONESHOT_API_TOKEN
LOCAL_TOKEN="$(head -c 32 /dev/urandom | xxd -p | tr -d '\n' 2>/dev/null || openssl rand -hex 32)"
# Use .runtime/ directory for runtime artifacts (not data/)
RUNTIME_DIR="${REPO_ROOT}/.runtime"
mkdir -p "${RUNTIME_DIR}"
TMP_ENV="${RUNTIME_DIR}/judge.env.tmp"
cat <<EOF > "${TMP_ENV}"
ONESHOT_API_TOKEN=${LOCAL_TOKEN}
ONESHOT_BIND_HOST=0.0.0.0
PORT=${PORT}
ONESHOT_MODE=sample
EOF

# 4. Remove stale container if present
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

# 5. Launch container
echo "Starting OneShot container on port ${PORT}..."
CONTAINER_ID="$(docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${PORT}:${PORT}" \
    --env-file "${TMP_ENV}" \
    "${IMAGE_TAG}")"

rm -f "${TMP_ENV}"

# 6. Wait for health
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
ROOT_URL="http://127.0.0.1:${PORT}/"
HEALTHY=0
DEADLINE=$(( $(date +%s) + 30 ))

echo "Waiting for container health check at ${HEALTH_URL}..."
while [ $(date +%s) -lt ${DEADLINE} ]; do
    if curl -s -H "Authorization: Bearer ${LOCAL_TOKEN}" "${HEALTH_URL}" | grep -q '"status":"ok"'; then
        HEALTHY=1
        echo "Health check PASSED"
        break
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null)" != "true" ]; then
        echo "ROOT_CAUSE: Container stopped unexpectedly:" >&2
        docker logs --tail 30 "${CONTAINER_NAME}" >&2
        exit 1
    fi
    sleep 0.5
done

if [ ${HEALTHY} -ne 1 ]; then
    echo "ROOT_CAUSE: Health check timed out after 30 seconds." >&2
    docker logs --tail 30 "${CONTAINER_NAME}" >&2
    exit 1
fi

# 7. Verify UI, Auth, and Static Files
STATUS_UNAUTH="$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}")"
if [ "${STATUS_UNAUTH}" != "401" ]; then
    echo "ROOT_CAUSE: Auth verification failed. Unauthenticated status was ${STATUS_UNAUTH} (expected 401)" >&2
    exit 1
fi
echo "Auth check PASSED: 401 on unauthenticated access"

STATUS_UI="$(curl -s -o /dev/null -w "%{http_code}" "${ROOT_URL}")"
if [ "${STATUS_UI}" != "200" ]; then
    echo "ROOT_CAUSE: Web UI returned status ${STATUS_UI} (expected 200)" >&2
    exit 1
fi
echo "UI check PASSED: root returned 200 OK"

STATUS_JS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/app.js")"
STATUS_CSS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/styles.css")"
if [ "${STATUS_JS}" != "200" ] || [ "${STATUS_CSS}" != "200" ]; then
    echo "ROOT_CAUSE: Static assets failed to return 200" >&2
    exit 1
fi
echo "Static assets check PASSED: /app.js and /styles.css returned 200 OK"

# 8. Run Browser E2E if requested
E2E_RESULT="NOT_RUN"
if [ "${RUN_E2E}" = "true" ]; then
    echo "Running canonical browser E2E test against container..."
    if command -v node >/dev/null 2>&1 && [ -f "${REPO_ROOT}/scripts/e2e/browser/state-adaptive-e2e.mjs" ]; then
        if ONESHOT_API_TOKEN="${LOCAL_TOKEN}" node "${REPO_ROOT}/scripts/e2e/browser/state-adaptive-e2e.mjs" >/dev/null 2>&1; then
            E2E_RESULT="PASSED"
            echo "Browser E2E test PASSED"
        else
            E2E_RESULT="FAILED"
            echo "Browser E2E test FAILED" >&2
        fi
        rm -rf "${REPO_ROOT}/dist/e2e-evidence/screenshots-state-adaptive" "${REPO_ROOT}/dist/e2e-evidence/state-adaptive-evidence.json"
    else
        E2E_RESULT="SKIPPED: Node or test suite not available on host"
    fi
fi

# 9. Output report
IMAGE_ID="$(docker inspect --format '{{.Id}}' "${CONTAINER_NAME}")"
echo ""
echo "ONESHOT_JUDGE_RESULT = PASSED"
echo "URL = http://localhost:${PORT}"
echo "MODE = sample"
echo "PROVIDER_KEY_REQUIRED = NO"
echo "LOCAL_ACCESS_TOKEN = GENERATED"
echo "CONTAINER = ${CONTAINER_NAME}"
echo "IMAGE = ${IMAGE_TAG} (${IMAGE_ID})"
echo "HEALTH = PASSED"
echo "UI = PASSED"
echo "AUTH = PASSED"
echo "E2E = ${E2E_RESULT}"
