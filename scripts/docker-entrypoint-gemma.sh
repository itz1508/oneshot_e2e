#!/bin/bash
# OneShot Startup Script with Ollama + Gemma 7B
# This script:
# 1. Starts Ollama service
# 2. Waits for Ollama to be ready
# 3. Ensures Gemma 7B is loaded
# 4. Starts OneShot HTTP server

set -e

# Configuration
OLLAMA_WAIT_TIMEOUT=60
ONESHOT_PORT=${PORT:-8787}
OLLAMA_PORT=${OLLAMA_HOST#*:}
OLLAMA_PORT=${OLLAMA_PORT:-11434}
# Default model: gemma2:2b (small, fast, fits comfortably in the 8G container
# memory limit). Override with OLLAMA_MODEL=gemma2:9b for higher quality.
DEFAULT_MODEL=gemma2:2b
MODEL=${OLLAMA_MODEL:-$DEFAULT_MODEL}

# Ollama runtime install location. Persisted in the `ollama_runtime` named
# volume (docker/docker-compose.gemma.yml) so the ~4GB install happens only once per
# host, not on every container recreation. A named volume (not a Windows bind
# mount) is required because executables cannot reliably run from a virtiofs
# mount.
OLLAMA_INSTALL_DIR=/opt/ollama
export PATH="${OLLAMA_INSTALL_DIR}/bin:${PATH}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Ollama is needed
check_research_provider() {
    if [[ "$ONESHOT_RESEARCH_PROVIDER" == "ollama" ]]; then
        return 0  # Need Ollama
    else
        log_info "Research provider is $ONESHOT_RESEARCH_PROVIDER (not Ollama)"
        return 1  # Don't need Ollama
    fi
}

# Install the Ollama runtime on first run.
# The official ~1.2GB tarball (ollama-linux-<arch>.tar.zst, ~4GB extracted) is
# STREAMED through zstd (curl | tar) instead of being downloaded to disk first.
# Peak memory stays at zstd's small decompression window, and the archive is
# never fully buffered — the build-time install of this same archive crashed
# the Docker buildkit daemon (OOM) on this machine on every attempt.
install_ollama() {
    # Integrity check: a partial extraction leaves an executable bin/ollama but
    # a truncated lib/ollama/llama-server ("exec format error" at inference
    # time) — this exact trap occurred when a WSL2 VM crash interrupted the
    # first install. Treat a missing runner binary as a broken install.
    if command -v ollama > /dev/null 2>&1 && [[ -x "${OLLAMA_INSTALL_DIR}/lib/ollama/llama-server" ]]; then
        log_success "Ollama already installed: $(ollama --version 2>/dev/null | head -1)"
        return 0
    fi
    if [[ -d "${OLLAMA_INSTALL_DIR}" ]] && [[ -n "$(ls -A "${OLLAMA_INSTALL_DIR}" 2>/dev/null)" ]]; then
        log_warn "Incomplete Ollama install detected in ${OLLAMA_INSTALL_DIR}; wiping and reinstalling..."
        rm -rf "${OLLAMA_INSTALL_DIR:?}"/*
    fi

    local arch
    case "$(uname -m)" in
        x86_64)          arch="amd64" ;;
        aarch64|arm64)   arch="arm64" ;;
        *)
            log_error "Unsupported architecture for Ollama: $(uname -m)"
            return 1
            ;;
    esac

    local url="https://ollama.com/download/ollama-linux-${arch}.tar.zst"
    log_info "Installing Ollama runtime (${arch}) to ${OLLAMA_INSTALL_DIR}..."
    log_info "Download is ~1.2GB; first run only (cached in the ollama_runtime volume)."

    # --limit-rate keeps the write rate below the kernel flush rate. Without
    # it, the extraction's dirty-page burst ballooned vmmemWSL and killed the
    # whole WSL2 VM on this memory-constrained host (6GB VM cap, ~4GB written
    # in seconds). 10MB/s adds ~2 minutes once per host.
    #
    # CUDA runner libs (lib/ollama/cuda_v12, cuda_v13) are EXCLUDED: they are
    # the bulk of the archive and this container runs on CPU. This roughly
    # halves the extraction I/O window — relevant because a WSL2 bug
    # (wslservice/wsl.exe 0xc00000fd stack overflow, seen on 2.7.10/2.7.13)
    # kills the whole VM mid-extraction on this host. Restore GPU support by
    # re-running the install without the --exclude flags.
    mkdir -p "${OLLAMA_INSTALL_DIR}"
    if ! curl -fsSL --limit-rate 10M "$url" | tar -I zstd -x -C "${OLLAMA_INSTALL_DIR}" \
        --exclude='*cuda_v12*' --exclude='*cuda_v13*'; then
        log_error "Failed to download/extract Ollama from ${url}"
        return 1
    fi

    if ! ollama --version; then
        log_error "Ollama installed but not executable at ${OLLAMA_INSTALL_DIR}/bin"
        return 1
    fi
    log_success "Ollama installed: $(ollama --version 2>/dev/null | head -1)"
}

# Start Ollama service
start_ollama() {
    log_info "Starting Ollama service on port $OLLAMA_PORT..."
    
    # Start Ollama in background
    ollama serve > /tmp/ollama.log 2>&1 &
    OLLAMA_PID=$!
    echo $OLLAMA_PID > /tmp/ollama.pid
    
    log_info "Ollama PID: $OLLAMA_PID"
}

# Wait for Ollama to be ready
wait_for_ollama() {
    local start_time=$(date +%s)
    local elapsed=0
    
    log_info "Waiting for Ollama to be ready (timeout: ${OLLAMA_WAIT_TIMEOUT}s)..."
    
    while [ $elapsed -lt $OLLAMA_WAIT_TIMEOUT ]; do
        if curl -s http://127.0.0.1:$OLLAMA_PORT/api/tags > /dev/null 2>&1; then
            log_success "Ollama is ready"
            return 0
        fi
        
        echo -ne "\r  Waiting... (${elapsed}s/$OLLAMA_WAIT_TIMEOUT)"
        sleep 2
        elapsed=$(($(date +%s) - start_time))
    done
    
    log_error "Ollama failed to start within ${OLLAMA_WAIT_TIMEOUT}s"
    cat /tmp/ollama.log
    return 1
}

# Ensure Gemma model is available (downloads on first run only)
ensure_gemma() {
    local model=$MODEL
    
    log_info "Checking if $model is available..."
    
    if ollama list 2>/dev/null | grep -q "$model"; then
        log_success "$model is already loaded (cached)"
        return 0
    fi
    
    log_warn "$model not found, pulling from Ollama library..."
    log_info "This may take 5-10 minutes on first run only..."
    log_info "Subsequent container starts will use the cached model."
    
    if ollama pull "$model"; then
        log_success "Successfully loaded $model"
        return 0
    else
        log_error "Failed to pull $model"
        return 1
    fi
}

# Verify OneShot can access Ollama
verify_ollama_connection() {
    log_info "Verifying OneShot can access Ollama..."

    local test_response=$(curl -s -X POST http://127.0.0.1:$OLLAMA_PORT/api/generate \
        -d '{"model":"'$MODEL'","prompt":"test","stream":false}' \
        -H "Content-Type: application/json" 2>/dev/null || echo "")

    if [[ $test_response == *"response"* ]]; then
        log_success "Ollama connection verified"
        return 0
    else
        log_warn "Could not verify Ollama connection, continuing..."
        return 0  # Don't fail here, might just be slow
    fi
}

# Seed the production provider config so the ProviderManager routes research
# requests to local Gemma. OneShot's production mode uses the web-managed
# runtime config (.runtime/config/providers.json), NOT ONESHOT_RESEARCH_PROVIDER.
# The supported transport is the OpenAI-compatible adapter pointed at Ollama's
# OpenAI-compatible endpoint (/v1).
seed_provider_config() {
    log_info "Seeding provider config: openai adapter -> Ollama ($MODEL)..."
    node -e '
        const fs = require("fs");
        const path = require("path");
        const file = "/app/.runtime/config/providers.json";
        const model = process.argv[1];
        const apiBase = process.argv[2];
        let cfg;
        try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch { cfg = undefined; }
        if (!cfg || cfg.version !== 1 || typeof cfg.providers !== "object" || !cfg.providers) {
            cfg = { version: 1, activeProvider: "openai", providers: {}, revision: 0 };
        }
        cfg.providers = cfg.providers || {};
        cfg.providers.openai = {
            enabled: true,
            model: model,
            apiBase: apiBase,
            timeoutSeconds: 600,
            parallelism: 1,
        };
        cfg.activeProvider = "openai";
        cfg.revision = (Number(cfg.revision) || 0) + 1;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
        console.log("[INFO] Seeded " + file + " (activeProvider=openai, model=" + model + ")");
    ' "$MODEL" "http://127.0.0.1:${OLLAMA_PORT}/v1"
}

# Start OneShot
start_oneshot() {
    log_info "Starting OneShot server on http://0.0.0.0:$ONESHOT_PORT"
    log_info "Research Provider: $ONESHOT_RESEARCH_PROVIDER"

    if [[ "$ONESHOT_RESEARCH_PROVIDER" == "ollama" ]]; then
        log_info "Using local Gemma via Ollama ($MODEL) on http://127.0.0.1:$OLLAMA_PORT"
        # The native provider transport requires a non-empty API key; Ollama
        # ignores it. Only default it when the user has not supplied one.
        export OPENAI_API_KEY="${OPENAI_API_KEY:-ollama-local}"
        seed_provider_config
    fi

    log_info ""
    log_success "OneShot Ready!"
    log_info "Access: http://localhost:$ONESHOT_PORT"
    log_info ""
    
    # Start OneShot (foreground, this becomes PID 1)
    exec node dist/backend/index.js
}

# Cleanup on exit
cleanup() {
    log_info "Shutting down..."
    if [ -f /tmp/ollama.pid ]; then
        OLLAMA_PID=$(cat /tmp/ollama.pid)
        log_info "Stopping Ollama (PID $OLLAMA_PID)..."
        kill $OLLAMA_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT SIGTERM SIGINT

# Main execution
echo "╔════════════════════════════════════════════════╗"
echo "║  OneShot with Ollama + Gemma 7B                ║"
echo "║  Ready for Research and Chat                   ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Check if we need Ollama
if ! check_research_provider; then
    log_warn "Ollama not needed for $ONESHOT_RESEARCH_PROVIDER, skipping Ollama startup"
    start_oneshot
fi

# Ollama is needed, install it if missing, then start it
if ! install_ollama; then
    log_error "Ollama installation failed"
    exit 1
fi

start_ollama

# Wait for Ollama to be ready
if ! wait_for_ollama; then
    log_error "Ollama startup failed"
    exit 1
fi

# Ensure Gemma is loaded
if ! ensure_gemma; then
    log_error "Failed to load Gemma model"
    exit 1
fi

# Verify connection
verify_ollama_connection

# Start OneShot
start_oneshot
