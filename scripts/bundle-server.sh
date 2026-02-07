#!/usr/bin/env bash
set -euo pipefail

# Bundle @dispatch/server and its workspace dependencies into a standalone
# directory that can be included in the Electron app's extraResources.
#
# Output: apps/desktop/server-dist/
#   dist/          - compiled server JS
#   node_modules/  - production dependencies (including workspace packages)
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

echo "==> Cleaning up dev-only artifacts..."
# Remove playwright browsers (not bundled in packaged app per design D2)
rm -rf "$OUTPUT_DIR/node_modules/playwright/browsers"
rm -rf "$OUTPUT_DIR/node_modules/playwright-core/.local-browsers"

echo "==> Rebuilding native addons for Electron..."
# Recompile better-sqlite3 and @lancedb/lancedb for Electron's Node ABI
ELECTRON_VERSION=$(node -e "console.log(require('$DESKTOP_DIR/node_modules/electron/package.json').version)")
npx electron-rebuild \
  --version "$ELECTRON_VERSION" \
  --module-dir "$OUTPUT_DIR" \
  --types prod \
  --force

echo "==> Server bundle created at $OUTPUT_DIR"
du -sh "$OUTPUT_DIR"
