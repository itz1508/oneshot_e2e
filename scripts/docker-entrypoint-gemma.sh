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

# Ensure Gemma model is available
ensure_gemma() {
    local model=${OLLAMA_MODEL:-gemma:7b}
    
    log_info "Checking if $model is available..."
    
    if ollama list 2>/dev/null | grep -q "$model"; then
        log_success "$model is already loaded"
        return 0
    fi
    
    log_warn "$model not found, pulling from Ollama library..."
    log_info "This may take 5-10 minutes on first run..."
    
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
        -d '{"model":"'${OLLAMA_MODEL:-gemma:7b}'","prompt":"test","stream":false}' \
        -H "Content-Type: application/json" 2>/dev/null || echo "")
    
    if [[ $test_response == *"response"* ]]; then
        log_success "Ollama connection verified"
        return 0
    else
        log_warn "Could not verify Ollama connection, continuing..."
        return 0  # Don't fail here, might just be slow
    fi
}

# Start OneShot
start_oneshot() {
    log_info "Starting OneShot server on http://0.0.0.0:$ONESHOT_PORT"
    log_info "Research Provider: $ONESHOT_RESEARCH_PROVIDER"
    
    if [[ "$ONESHOT_RESEARCH_PROVIDER" == "ollama" ]]; then
        log_info "Using local Gemma 7B via Ollama on http://127.0.0.1:$OLLAMA_PORT"
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

# Ollama is needed, start it
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
