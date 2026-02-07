#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_PKG="$REPO_ROOT/package.json"
DESKTOP_PKG="$REPO_ROOT/apps/desktop/package.json"

usage() {
  cat <<'EOF'
Usage:
  scripts/bump-version.sh [--no-commit] [--no-tag] <patch|minor|major|x.y.z>

Examples:
  scripts/bump-version.sh patch
  scripts/bump-version.sh minor
  scripts/bump-version.sh 0.2.0
  scripts/bump-version.sh --no-commit patch
  scripts/bump-version.sh --no-tag patch
EOF
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

COMMIT_CHANGES=1
TAG_VERSION=1

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --no-commit)
      COMMIT_CHANGES=0
      TAG_VERSION=0
      shift
      ;;
    --no-tag)
      TAG_VERSION=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

TARGET="$1"

node - "$ROOT_PKG" "$DESKTOP_PKG" "$TARGET" <<'NODE'
const fs = require("fs");

const [rootPkgPath, desktopPkgPath, target] = process.argv.slice(2);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function bump(currentVersion, bumpType) {
  const parsed = parseSemver(currentVersion);
  if (!parsed) {
    throw new Error(`Current version "${currentVersion}" is not strict semver (x.y.z).`);
  }

  if (bumpType === "patch") return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  if (bumpType === "minor") return `${parsed.major}.${parsed.minor + 1}.0`;
  if (bumpType === "major") return `${parsed.major + 1}.0.0`;

  if (parseSemver(bumpType)) return bumpType;
  throw new Error(`Invalid target "${bumpType}". Use patch|minor|major|x.y.z`);
}

const rootPkg = readJson(rootPkgPath);
const desktopPkg = readJson(desktopPkgPath);

if (!rootPkg.version) {
  throw new Error(`Missing version in ${rootPkgPath}`);
}

const fromRoot = rootPkg.version;
const fromDesktop = desktopPkg.version;
const nextVersion = bump(fromRoot, target);

rootPkg.version = nextVersion;
desktopPkg.version = nextVersion;

writeJson(rootPkgPath, rootPkg);
writeJson(desktopPkgPath, desktopPkg);

console.log(`Bumped version: ${fromRoot} -> ${nextVersion}`);
if (fromDesktop && fromDesktop !== fromRoot) {
  console.log(`Desktop version was out of sync: ${fromDesktop} -> ${nextVersion}`);
}
console.log(`Suggested tag: v${nextVersion}`);
NODE

NEW_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$ROOT_PKG', 'utf8')).version)")"

if [ "$COMMIT_CHANGES" -eq 1 ] || [ "$TAG_VERSION" -eq 1 ]; then
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not a git repository. Skipping git commit/tag."
    exit 0
  fi
fi

if [ "$COMMIT_CHANGES" -eq 1 ]; then
  git add "$ROOT_PKG" "$DESKTOP_PKG"
  if git diff --cached --quiet; then
    echo "No version changes staged. Skipping commit."
  else
    git commit -m "chore: bump version to v$NEW_VERSION"
    echo "Created commit: chore: bump version to v$NEW_VERSION"
  fi
fi

if [ "$TAG_VERSION" -eq 1 ]; then
  TAG_NAME="v$NEW_VERSION"
  if git rev-parse -q --verify "refs/tags/$TAG_NAME" >/dev/null; then
    echo "Tag already exists: $TAG_NAME"
  else
    git tag "$TAG_NAME"
    echo "Created tag: $TAG_NAME"
  fi
fi
