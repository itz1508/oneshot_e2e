#!/usr/bin/env bash
# ==============================================================================
# OneShot Production E2E 1.3.0 - Automated Setup & Verification (macOS / Linux)
# ==============================================================================
set -euo pipefail

project_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"

echo ""
echo "================================================================"
echo "  OneShot Production E2E 1.3.0 - Automated Setup & Verification"
echo "================================================================"
echo ""

# -- Step 1: Prerequisites -----------------------------------------------------
echo "[1/5] Checking prerequisites..."

if ! command -v node >/dev/null 2>&1; then
    echo "  [ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "  [ERROR] Node.js $NODE_VER found, but 20+ is required."
    exit 1
fi
echo "       Node.js $NODE_VER ... [OK]"

PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "  [ERROR] Python is not installed. Please install Python 3.11+ from https://www.python.org"
    exit 1
fi

PY_VER=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 11 ]; }; then
    echo "  [ERROR] Python $PY_VER found, but 3.11+ is required."
    exit 1
fi
echo "       Python $PY_VER ... [OK]"

# -- Step 2: Python Virtual Environment ----------------------------------------
echo ""
echo "[2/5] Initializing Python virtual environment..."

if [ ! -f ".venv/bin/activate" ]; then
    $PYTHON_CMD -m venv .venv
    echo "       Created .venv virtual environment"
else
    echo "       .venv virtual environment already exists"
fi
source .venv/bin/activate

# -- Step 3: Python Dependencies -----------------------------------------------
echo ""
echo "[3/5] Installing pinned Python dependencies..."
pip install -q -r requirements/core.txt
pip install -q -r requirements/workspace-api.txt
echo "       Python dependencies installed successfully ... [OK]"

# -- Step 4: Node Dependencies & Build -----------------------------------------
echo ""
echo "[4/5] Installing Node dependencies and compiling bundles..."
npm ci --offline --ignore-scripts --no-audit --no-fund 2>/dev/null || {
    npm install --no-audit --no-fund 2>/dev/null
}
npm --prefix web install --no-audit --no-fund 2>/dev/null
echo "       Node dependencies installed ... [OK]"

npm run build >/dev/null 2>&1
echo "       Backend and frontend bundles compiled ... [OK]"

# -- Step 5: Verification Suite ------------------------------------------------
echo ""
echo "[5/5] Executing full verification matrix (Python + Node + Vitest + Manifest)..."
echo ""

npm run verify
npm --prefix web test

echo ""
echo "================================================================"
echo "  SETUP COMPLETE - All verification suites passed (100% Green)"
echo "================================================================"
echo ""
echo "  To launch the OneShot platform:"
echo "    npm run oneshot    Auto-start and open http://localhost:8787"
echo "    npm start          Start backend server directly"
echo "    ./start-oneshot.sh 1-Click Docker container launcher"
echo ""
