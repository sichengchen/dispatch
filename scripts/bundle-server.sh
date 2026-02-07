#!/usr/bin/env bash
set -euo pipefail

# Bundle @dispatch/server and workspace dependencies into a standalone
# directory for Electron extraResources.
#
# Output: apps/desktop/server-dist/
#   dist/          - compiled server output
#   node_modules/  - production dependencies (including workspace deps)
#   package.json   - server package manifest

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"
OUTPUT_DIR="$DESKTOP_DIR/server-dist"

echo "==> Building workspace packages..."
pnpm --filter @dispatch/db build
pnpm --filter @dispatch/lib build
pnpm --filter @dispatch/server build

echo "==> Deploying @dispatch/server to $OUTPUT_DIR..."
rm -rf "$OUTPUT_DIR"
pnpm --filter @dispatch/server deploy "$OUTPUT_DIR" --prod

echo "==> Rebuilding native addons for Electron..."
ELECTRON_VERSION=$(cd "$DESKTOP_DIR" && node -e "console.log(require('electron/package.json').version)")
npx electron-rebuild \
  --version "$ELECTRON_VERSION" \
  --module-dir "$OUTPUT_DIR" \
  --types prod \
  --force

echo "==> Server bundle created at $OUTPUT_DIR"
du -sh "$OUTPUT_DIR"
