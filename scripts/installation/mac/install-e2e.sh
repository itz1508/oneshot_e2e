#!/usr/bin/env bash
# scripts/installation/mac/install-e2e.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/../../install-e2e.sh" "$@"
