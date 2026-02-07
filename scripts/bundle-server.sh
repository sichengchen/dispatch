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

echo "==> Assembling server bundle at $OUTPUT_DIR..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy compiled server output.
cp -R "$REPO_ROOT/packages/server/dist" "$OUTPUT_DIR/dist"

# Build a merged package.json so npm can install a flat production tree
# without workspace:* references.
(cd "$REPO_ROOT" && node -e "
const path = require('path');
const fs = require('fs');
const read = (p) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), 'utf8'));
const server = read('packages/server/package.json');
const db = read('packages/db/package.json');
const lib = read('packages/lib/package.json');
const deps = { ...server.dependencies };
delete deps['@dispatch/db'];
delete deps['@dispatch/lib'];
Object.assign(deps, db.dependencies || {}, lib.dependencies || {});
server.name = '@dispatch/server-bundle';
server.private = true;
server.dependencies = deps;
delete server.devDependencies;
console.log(JSON.stringify(server, null, 2));
") > "$OUTPUT_DIR/package.json"

echo "==> Installing production dependencies..."
(cd "$OUTPUT_DIR" && npm install --omit=dev --ignore-scripts)

# Copy workspace packages into node_modules as local packages.
echo "==> Copying workspace packages..."
for pkg in db lib; do
  dest="$OUTPUT_DIR/node_modules/@dispatch/$pkg"
  mkdir -p "$dest"
  cp "$REPO_ROOT/packages/$pkg/package.json" "$dest/package.json"
  cp -R "$REPO_ROOT/packages/$pkg/dist" "$dest/dist"
done

# Override parent .gitignore so electron-builder includes node_modules.
printf '!node_modules/\n' > "$OUTPUT_DIR/.gitignore"

echo "==> Pruning non-runtime files..."
rm -rf "$OUTPUT_DIR/node_modules/.bin"
rm -f "$OUTPUT_DIR/package-lock.json"
find "$OUTPUT_DIR/node_modules" -type f \
  \( -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" -o -name "*.md" -o -name "*.markdown" -o -name "*.map" \) \
  -delete
find "$OUTPUT_DIR/node_modules" -type d \
  \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name ".github" -o -name "example" -o -name "examples" \) \
  -prune -exec rm -rf {} +

echo "==> Rebuilding native addons for Electron..."
ELECTRON_VERSION=$(cd "$DESKTOP_DIR" && node -e "console.log(require('electron/package.json').version)")
npx electron-rebuild \
  --version "$ELECTRON_VERSION" \
  --module-dir "$OUTPUT_DIR" \
  --types prod \
  --force

echo "==> Server bundle created at $OUTPUT_DIR"
du -sh "$OUTPUT_DIR"
