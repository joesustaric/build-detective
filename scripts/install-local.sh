#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

info()  { echo -e "${GREEN}[install-local]${NC} $1"; }
warn()  { echo -e "${YELLOW}[install-local]${NC} $1"; }
error() { echo -e "${RED}[install-local]${NC} $1" >&2; exit 1; }

# ── Preflight checks ──────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "'node' not found. Install via mise: mise install"
"$REPO_ROOT/node_modules/.bin/vsce" --version >/dev/null 2>&1 \
  || error "'vsce' not found in node_modules. Run: pnpm install"

HAS_CODE=false
HAS_CURSOR=false
command -v code   >/dev/null 2>&1 && HAS_CODE=true
command -v cursor >/dev/null 2>&1 && HAS_CURSOR=true

if ! $HAS_CODE && ! $HAS_CURSOR; then
  error "Neither 'code' nor 'cursor' found in PATH. Make sure at least one editor's CLI is installed."
fi

# ── Package ───────────────────────────────────────────────────────────────────
VERSION=$(node -p "require('$REPO_ROOT/package.json').version")
VSIX_FILE="$REPO_ROOT/build-detective-$VERSION.vsix"

info "Packaging v$VERSION..."
"$REPO_ROOT/node_modules/.bin/vsce" package --no-dependencies --out "$VSIX_FILE"
info "Built $VSIX_FILE"

# ── Install ───────────────────────────────────────────────────────────────────
if $HAS_CODE; then
  info "Installing in VS Code..."
  code --install-extension "$VSIX_FILE" --force
  info "VS Code: installed. Reload with Cmd+Shift+P → 'Developer: Reload Window'"
else
  warn "VS Code CLI ('code') not found — skipping."
fi

if $HAS_CURSOR; then
  info "Installing in Cursor..."
  cursor --install-extension "$VSIX_FILE" --force
  info "Cursor: installed. Reload with Cmd+Shift+P → 'Developer: Reload Window'"
else
  warn "Cursor CLI ('cursor') not found — skipping."
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm "$VSIX_FILE"
info "Cleaned up local .vsix"
