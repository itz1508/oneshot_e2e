#!/usr/bin/env bash
set -e

echo "OneShot Setup (Unix)"
echo "===================="

# 1. Check Git
echo "[1/8] Checking Git..."
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git not found"
    echo "Please install Git from https://git-scm.com/"
    exit 1
fi
echo "[OK] Git detected"

# 2. Check Python runtime >= 3.12
echo "[2/8] Checking Python runtime..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "[ERROR] Python not found"
    echo "Please install Python >= 3.12"
    exit 1
fi

if ! $PYTHON_CMD -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"; then
    echo "[ERROR] Python version is too old. Python >= 3.12 is required."
    exit 1
fi
PY_VER=$($PYTHON_CMD --version)
echo "[OK] $PY_VER"

# 3. Setup Environment Configuration
echo "[3/8] Checking environment configuration..."
if [ ! -f "app/env/.env" ]; then
    if [ -f "app/env/.env.example" ]; then
        cp "app/env/.env.example" "app/env/.env"
        echo "[OK] Created app/env/.env from template"
    else
        echo "[WARNING] app/env/.env.example template not found"
    fi
else
    echo "[OK] app/env/.env exists"
fi

# 4. Check Node.js >= 24.21.0
echo "[4/8] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found"
    echo "Please install Node.js >= 24.21.0 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
if ! node -e "const v=process.argv[1].split('.').map(Number),r=[24,21,0];process.exit(v[0]!==r[0]?v[0]-r[0]:v[1]!==r[1]?v[1]-r[1]:v[2]-r[2])" "$NODE_VERSION"; then
    echo "[ERROR] Node.js version $NODE_VERSION is too old"
    echo "Please install Node.js >= 24.21.0"
    exit 1
fi
echo "[OK] Node.js $NODE_VERSION"

# 5. Check pnpm >= 11.27.1
echo "[5/8] Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo "[ERROR] pnpm not found"
    echo "Install Node.js >= 24.21.0 and enable Corepack, then run: corepack enable"
    exit 1
fi
PNPM_VERSION=$(pnpm --version)
if ! node -e "const v=process.argv[1].split('.').map(Number),r=[11,27,1];process.exit(v[0]!==r[0]?v[0]-r[0]:v[1]!==r[1]?v[1]-r[1]:v[2]-r[2])" "$PNPM_VERSION"; then
    echo "[ERROR] pnpm version $PNPM_VERSION is too old"
    echo "Please install pnpm >= 11.27.1"
    exit 1
fi
echo "[OK] pnpm $PNPM_VERSION"

# 6. Install dependencies
echo "[6/8] Installing dependencies..."
pnpm install --frozen-lockfile

# 7. Build backend & UI
echo "[7/8] Compiling backend and UI..."
pnpm run build:backend
pnpm run build:ui

# 8. Generate and verify manifest
echo "[8/8] Verifying repository manifest and integrity..."
$PYTHON_CMD app/scripts/generate_manifest.py || echo "[WARNING] Manifest generation failed"
$PYTHON_CMD app/scripts/verify_all.py || echo "[WARNING] Verification reported issues"

echo ""
echo "Setup complete!"
echo ""
echo "Start server: pnpm run start"
echo ""
echo "Open browser: http://localhost:8787"
echo ""

