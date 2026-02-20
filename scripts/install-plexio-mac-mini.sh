#!/usr/bin/env bash
# Install built Plexio.app to Mac mini via SSH (rsync).
# Requires: ssh macmini works (Remote Login on, ~/.ssh/config with Host macmini).
# Usage: run from repo root. For repeated installs, rsync only sends changed files.

set -e

MACMINI_HOST="${MACMINI_HOST:-macmini}"
REMOTE_APPS="/Applications"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_APP="$REPO_ROOT/release/mac-arm64/Plexio.app"

if [[ ! -d "$SRC_APP" ]]; then
  echo "Source app not found: $SRC_APP"
  echo "Run 'npm run build' first."
  exit 1
fi

echo "Checking SSH connection to $MACMINI_HOST..."
if ! ssh -o ConnectTimeout=5 "$MACMINI_HOST" true 2>/dev/null; then
  echo "Cannot reach $MACMINI_HOST. Ensure Remote Login is on and 'ssh $MACMINI_HOST' works."
  exit 1
fi

echo "Syncing Plexio.app to $MACMINI_HOST:$REMOTE_APPS (rsync over SSH, incremental)..."
rsync -a --delete --progress -e ssh "$SRC_APP" "$MACMINI_HOST:$REMOTE_APPS/"

echo "✅ Done. Plexio.app installed to $MACMINI_HOST:$REMOTE_APPS/Plexio.app"
