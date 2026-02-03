#!/usr/bin/env bash
set -euo pipefail

# Basic secret scan for known API key prefixes
if rg -n "AIza" . --glob '!node_modules/**' --glob '!dist/**' --glob '!dist-electron/**' --glob '!scripts/check-secrets.sh'; then
  echo "Found potential Gemini API key in repo."
  exit 1
fi

echo "No Gemini API key prefixes found."
