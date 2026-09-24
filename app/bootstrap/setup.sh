#!/usr/bin/env bash
set -e

echo "OneShot Setup (Unix)"
echo "===================="

# Check Node.js
echo "[1/7] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found"
    echo "Please install Node.js >= 24.13.0 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 24 ]; then
    echo "[ERROR] Node.js version $NODE_VERSION is too old"
    echo "Please install Node.js >= 24.13.0"
    exit 1
fi
echo "[OK] Node.js $NODE_VERSION"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "[ERROR] pnpm not found"
    echo "Install Node.js >= 24.13.0 and enable Corepack, then run: corepack enable"
    exit 1
fi
echo "[OK] pnpm found"

# Install dependencies
echo "[3/7] Installing dependencies..."
pnpm install --frozen-lockfile

# Build backend
echo "[4/7] Building backend..."
pnpm run build:backend

# Build frontend
echo "[5/7] Building frontend..."
pnpm run build:ui

# Generate manifest
echo "[6/7] Generating manifest..."
python3 app/scripts/generate_manifest.py

# Verify
echo "[7/7] Running verification..."
python3 app/scripts/verify_all.py || echo "[WARNING] Verification reported issues"

echo ""
echo "Setup complete!"
echo ""
echo "Start server: pnpm run start"
echo ""
echo "Open browser: http://localhost:8787"
echo ""
