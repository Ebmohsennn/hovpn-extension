#!/usr/bin/env bash
# Hovpn installer for macOS / Linux. Thin wrapper around the cross-platform
# Node installer. Usage: ./install.sh <chrome-extension-id>
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is required but was not found on PATH." >&2
  echo "Install it (macOS: 'brew install node', Linux: your package manager) and re-run." >&2
  exit 1
fi

exec "$NODE_BIN" "$DIR/install.js" "$@"
