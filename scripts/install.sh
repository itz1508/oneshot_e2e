#!/usr/bin/env bash
# OneShot E2E — Automated Unix 1-Line Installer & Launcher
set -e

INSTALL_DIR="${1:-$HOME/oneshot_e2e}"

echo ""
echo "============================================================"
echo "         OneShot E2E — Automated 1-Click Installer          "
echo "============================================================"
echo ""

# 1. Require Git
if ! command -v git >/dev/null 2>&1; then
    echo "[ERROR] git is required to clone and install OneShot." >&2
    echo "        Please install Git and re-run." >&2
    exit 1
fi

# 2. Clone repository via Git (clean clone, no zip unpacking)
if [ ! -d "$INSTALL_DIR" ]; then
    echo "[1/2] Cloning repository via git into $INSTALL_DIR..."
    git clone https://github.com/itz1508/oneshot_e2e.git "$INSTALL_DIR"
else
    echo "[1/2] Using existing directory: $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Ensure pnpm is installed
if ! command -v pnpm >/dev/null 2>&1; then
    echo "[2/3] Enabling pnpm package manager..."
    if command -v corepack >/dev/null 2>&1; then
        corepack enable >/dev/null 2>&1 || true
    elif command -v npm >/dev/null 2>&1; then
        npm install -g pnpm >/dev/null 2>&1 || true
    fi
fi

# 4. Initialize .env if missing
if [ ! -f "app/env/.env" ] && [ -f "app/env/.env.example" ]; then
    cp "app/env/.env.example" "app/env/.env"
fi

echo ""
echo "📍 Project Folder: $(pwd)"
echo "🌐 Starting OneShot console..."
echo ""

if [ ! -d "node_modules" ]; then
    pnpm install
fi

pnpm run oneshot
