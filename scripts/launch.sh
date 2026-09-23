#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
echo "============================================================"
echo "         OneShot E2E - 1-Click Application Launcher"
echo "============================================================"
echo ""
echo "📍 Project Folder: $(pwd)"
echo "🌐 Launching OneShot console..."
echo ""
pnpm run oneshot
