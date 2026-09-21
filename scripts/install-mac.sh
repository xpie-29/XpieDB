#!/bin/bash
# Builds XpieDB and installs it to /Applications (or ~/Applications when that
# is not writable). No Apple Developer account is needed: an app built and run
# on the same Mac is not blocked by Gatekeeper. Your library is never touched;
# it lives in ~/Library/Application Support/com.xpiedb.desktop.
#
# Options:
#   --no-open                   install without launching the app
# Environment:
#   XPIEDB_INSTALL_DIR=/some/folder   install there instead of Applications
set -euo pipefail

OPEN=1
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN=0 ;;
    *) echo "Unknown option: $arg (supported: --no-open)" >&2; exit 2 ;;
  esac
done

if [ "$(uname)" != "Darwin" ]; then
  echo "This script installs the macOS app. Run it on a Mac." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
# Homebrew installs rustup outside the default PATH.
for dir in /opt/homebrew/opt/rustup/bin "$HOME/.cargo/bin"; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH
command -v cargo >/dev/null || { echo "Rust (cargo) was not found. Install it with: brew install rustup   (then see the README, step 3)" >&2; exit 1; }
command -v npm >/dev/null || { echo "Node.js (npm) was not found. Install it with: brew install node" >&2; exit 1; }
[ -d node_modules ] || { echo "Installing JavaScript dependencies..."; npm install; }

echo "Building XpieDB (several minutes the first time, under a minute afterwards)..."
npm run tauri build -- --bundles app

APP="src-tauri/target/release/bundle/macos/XpieDB.app"
[ -d "$APP" ] || { echo "The build did not produce $APP" >&2; exit 1; }

if [ -n "${XPIEDB_INSTALL_DIR:-}" ]; then
  DEST="$XPIEDB_INSTALL_DIR"
elif [ -w /Applications ]; then
  DEST=/Applications
else
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

# Close a running copy of the app being replaced (only the one at the destination).
RUNNING="$DEST/XpieDB.app/Contents/MacOS/xpiedb"
if pgrep -f -- "$RUNNING" >/dev/null; then
  echo "Closing the running XpieDB..."
  osascript -e 'tell application "XpieDB" to quit' >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6; do pgrep -f -- "$RUNNING" >/dev/null || break; sleep 1; done
  pgrep -f -- "$RUNNING" >/dev/null && pkill -f -- "$RUNNING" || true
  sleep 1
fi

rm -rf "$DEST/XpieDB.app"
ditto "$APP" "$DEST/XpieDB.app"
echo "Installed $DEST/XpieDB.app"
if [ "$OPEN" = 1 ]; then open "$DEST/XpieDB.app"; fi
