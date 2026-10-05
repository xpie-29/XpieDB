#!/bin/bash
# Launches the freshly built XpieDB.app against a THROWAWAY copy of the library, so it can be tried
# and driven without touching the real one in ~/Library/Application Support/com.xpiedb.desktop.
#
#   scripts/mac-test-run.sh            seed the sandbox from a copy of the real library, then launch
#   scripts/mac-test-run.sh --empty    start with an empty library
#   scripts/mac-test-run.sh --stop     quit the sandbox app and delete the sandbox
#
# Build first with:  npm run tauri build -- --bundles app
# The sandbox lives in $SANDBOX (default /tmp/xpiedb-sandbox). The app is started with HOME pointing
# there, so its data folder is $SANDBOX/Library/Application Support/com.xpiedb.desktop.
set -euo pipefail
cd "$(dirname "$0")/.."
SANDBOX="${SANDBOX:-/tmp/xpiedb-sandbox}"
REAL="$HOME/Library/Application Support/com.xpiedb.desktop"
APP="src-tauri/target/release/bundle/macos/XpieDB.app"
BIN="$SANDBOX/XpieDB.app/Contents/MacOS/xpiedb"

stop() { pkill -f -- "$BIN" 2>/dev/null || true; sleep 1; }
if [ "${1:-}" = "--stop" ]; then stop; rm -rf "$SANDBOX"; echo "Sandbox removed."; exit 0; fi

[ -d "$APP" ] || { echo "No built app at $APP. Run: npm run tauri build -- --bundles app" >&2; exit 1; }
stop
rm -rf "$SANDBOX"
DATA="$SANDBOX/Library/Application Support/com.xpiedb.desktop"
mkdir -p "$DATA"
if [ "${1:-}" != "--empty" ] && [ -f "$REAL/xpiedb.db" ]; then
  # Read-only copy of the real library; the original is never written.
  cp "$REAL"/xpiedb.db* "$DATA"/
  [ -d "$REAL/covers" ] && cp -R "$REAL/covers" "$DATA/covers"
  [ -d "$REAL/platform-icons" ] && cp -R "$REAL/platform-icons" "$DATA/platform-icons"
fi
ditto "$APP" "$SANDBOX/XpieDB.app"
HOME="$SANDBOX" nohup "$BIN" >"$SANDBOX/app.log" 2>&1 &
echo "Launched against $DATA (pid $!)."
