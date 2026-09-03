#!/usr/bin/env bash
set -euo pipefail

echo ""
echo " ============================================================"
echo "  OneShot Production E2E - Automated Setup"
echo " ============================================================"
echo ""

# ── Prerequisites ────────────────────────────────────────────────
echo "[1/6] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    echo "  ERROR: Node.js is not installed."
    echo "  Install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "  ERROR: Node.js $NODE_VER found, but 20+ is required."
    exit 1
fi
echo "       Node.js $NODE_VER ... OK"

PYTHON_CMD=""
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "  ERROR: Python is not installed."
    echo "  Install Python 3.11+ from https://www.python.org"
    exit 1
fi

PY_VER=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
    echo "  ERROR: Python $PY_VER found, but 3.11+ is required."
    exit 1
fi
echo "       Python $PY_VER ... OK"

# ── Python venv ──────────────────────────────────────────────────
echo ""
echo "[2/6] Setting up Python virtual environment..."

if [ ! -f ".venv/bin/activate" ]; then
    $PYTHON_CMD -m venv .venv
    echo "       Created .venv"
else
    echo "       .venv already exists"
fi
source .venv/bin/activate

# ── Python dependencies ──────────────────────────────────────────
echo ""
echo "[3/6] Installing Python dependencies..."
pip install -q -r app/requirements/base.txt
pip install -q -r app/requirements/workspace-api.txt
echo "       Python deps installed"

# ── Node dependencies ────────────────────────────────────────────
echo ""
echo "[4/6] Installing Node.js dependencies (offline from vendor)..."
npm ci --offline --ignore-scripts --no-audit --no-fund 2>/dev/null || {
    echo "       Retrying with network..."
    npm install --no-audit --no-fund 2>/dev/null
}
npm --prefix web install --no-audit --no-fund 2>/dev/null
echo "       Node deps installed"

# ── Build ────────────────────────────────────────────────────────
echo ""
echo "[5/6] Building TypeScript..."
npm run build >/dev/null 2>&1
echo "       Build complete"

# ── Tests ────────────────────────────────────────────────────────
echo ""
echo "[6/6] Running test suite (94 tests)..."
echo ""

$PYTHON_CMD -m unittest discover -s tests -v 2>&1

echo ""
node --test --test-force-exit dist/tests_ts/*.test.js

echo ""
echo " ============================================================"
echo "  SETUP COMPLETE - All 94 tests passed!"
echo " ============================================================"
echo ""
echo "  Next steps:"
echo "    npm run demo       Launch OneShot for Demonstration"
echo "    npm start          Start the full server on http://localhost:8787"
echo ""
