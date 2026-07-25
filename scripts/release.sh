#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

info()  { echo -e "${GREEN}[release]${NC} $1"; }
warn()  { echo -e "${YELLOW}[release]${NC} $1"; }
error() { echo -e "${RED}[release]${NC} $1" >&2; exit 1; }

trap 'echo -e "${RED}[release]${NC} Script failed. Check: git log, git tag -l, and gh release list for partial state." >&2' ERR

# ── Preflight checks ──────────────────────────────────────────────────────────
info "Running preflight checks..."

command -v gh   >/dev/null 2>&1 || error "'gh' CLI not found. Install with: brew install gh"
command -v node >/dev/null 2>&1 || error "'node' not found. Install via mise: mise install"
command -v op   >/dev/null 2>&1 || error "'op' (1Password CLI) not found. Install with: brew install --cask 1password-cli"
"$REPO_ROOT/node_modules/.bin/vsce" --version >/dev/null 2>&1 \
  || error "'vsce' not found in node_modules. Run: pnpm install"
"$REPO_ROOT/node_modules/.bin/ovsx" --version >/dev/null 2>&1 \
  || error "'ovsx' not found in node_modules. Run: pnpm install"

gh auth status >/dev/null 2>&1 || error "Not authenticated with gh. Run: gh auth login"

info "Fetching publish tokens from 1Password..."
VSCE_PAT=$(op read "op://Personal/VS Code Marketplace/credential" 2>/dev/null) \
  || error "Could not read the VS Code Marketplace token from 1Password (op://Personal/VS Code Marketplace/credential). Create that item, or edit the op:// path in scripts/release.sh to match yours."
OVSX_PAT=$(op read "op://Personal/Open VSX/credential" 2>/dev/null) \
  || error "Could not read the Open VSX token from 1Password (op://Personal/Open VSX/credential). Create that item, or edit the op:// path in scripts/release.sh to match yours."

if ! git diff --quiet || ! git diff --cached --quiet; then
  error "Working tree is not clean. Commit or stash your changes first."
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  error "Must be on 'main' branch. Currently on '$CURRENT_BRANCH'."
fi

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  error "Local 'main' is out of sync with origin/main. Run: git pull"
fi

[ -f "$REPO_ROOT/CHANGELOG.md" ] || error "CHANGELOG.md not found at repo root."
UNRELEASED_CONTENT=$(awk '/^## \[Unreleased\]/{found=1; next} found && /^## \[/{exit} found{print}' "$REPO_ROOT/CHANGELOG.md" | grep -v '^[[:space:]]*$' || true)
if [ -z "$UNRELEASED_CONTENT" ]; then
  error "No content under [Unreleased] in CHANGELOG.md. Add release notes before releasing."
fi

info "Running tests..."
pnpm test || error "Tests failed. Fix failing tests before releasing."

info "All preflight checks passed."

# ── Bump version ──────────────────────────────────────────────────────────────
CURRENT_VERSION=$(node -p "require('$REPO_ROOT/package.json').version")
info "Current version: $CURRENT_VERSION"

echo ""
echo "Bump type?"
echo "  1) major"
echo "  2) minor"
echo "  3) patch"
echo "  4) explicit version"
read -rp "Select 1-4: " BUMP_CHOICE

case "$BUMP_CHOICE" in
  1) BUMP_TYPE=major ;;
  2) BUMP_TYPE=minor ;;
  3) BUMP_TYPE=patch ;;
  4) BUMP_TYPE=explicit ;;
  *) error "Select 1, 2, 3, or 4" ;;
esac

if [ "$BUMP_TYPE" = "explicit" ]; then
  read -rp "New version (e.g. 0.14.0): " NEW_VERSION
  [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || error "Version must be in the form X.Y.Z"
else
  NEW_VERSION=$(node -e "
const [major, minor, patch] = '$CURRENT_VERSION'.split('.').map(Number);
if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
  process.stderr.write('ERROR: could not parse version: $CURRENT_VERSION\n');
  process.exit(1);
}
if ('$BUMP_TYPE' === 'major') console.log((major + 1) + '.0.0');
else if ('$BUMP_TYPE' === 'minor') console.log(major + '.' + (minor + 1) + '.0');
else console.log(major + '.' + minor + '.' + (patch + 1));
")
fi

info "Bumping $CURRENT_VERSION → $NEW_VERSION"

# ── Update files ──────────────────────────────────────────────────────────────
TODAY=$(date +%Y-%m-%d)

# Update package.json version
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$REPO_ROOT/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Promote [Unreleased] to new version in CHANGELOG.md
node -e "
const fs = require('fs');
const content = fs.readFileSync('$REPO_ROOT/CHANGELOG.md', 'utf8');
const updated = content.replace(
  '## [Unreleased]',
  '## [Unreleased]\n\n## [$NEW_VERSION] - $TODAY'
);
if (updated === content) {
  process.stderr.write('ERROR: [Unreleased] heading not found in CHANGELOG.md\n');
  process.exit(1);
}
fs.writeFileSync('$REPO_ROOT/CHANGELOG.md', updated);
"

info "Updated package.json to $NEW_VERSION and CHANGELOG.md"

# ── Git: commit, tag, push ────────────────────────────────────────────────────
git -C "$REPO_ROOT" add "$REPO_ROOT/package.json" "$REPO_ROOT/CHANGELOG.md"
git -C "$REPO_ROOT" commit -m "chore: release v$NEW_VERSION"
git -C "$REPO_ROOT" tag "v$NEW_VERSION"

info "Committed and tagged v$NEW_VERSION locally"

# ── Build .vsix ───────────────────────────────────────────────────────────────
VSIX_FILE="$REPO_ROOT/build-detective-$NEW_VERSION.vsix"
"$REPO_ROOT/node_modules/.bin/vsce" package --no-dependencies --out "$VSIX_FILE"

info "Built $VSIX_FILE"

# ── Push to origin ────────────────────────────────────────────────────────────
git -C "$REPO_ROOT" push origin main
git -C "$REPO_ROOT" push origin "v$NEW_VERSION"

info "Pushed v$NEW_VERSION to origin"

# ── Extract release notes from CHANGELOG ─────────────────────────────────────
RELEASE_NOTES=$(awk "/^## \[$NEW_VERSION\]/{found=1; next} found && /^## \[/{exit} found{print}" "$REPO_ROOT/CHANGELOG.md" | sed '/^[[:space:]]*$/d')

# ── Publish GitHub Release ────────────────────────────────────────────────────
gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --notes "$RELEASE_NOTES" \
  "$VSIX_FILE"

info "GitHub Release v$NEW_VERSION published"

# ── Publish to marketplaces ───────────────────────────────────────────────────
info "Publishing to VS Code Marketplace..."
"$REPO_ROOT/node_modules/.bin/vsce" publish --packagePath "$VSIX_FILE" -p "$VSCE_PAT"
info "Published to VS Code Marketplace"

info "Publishing to Open VSX..."
"$REPO_ROOT/node_modules/.bin/ovsx" publish "$VSIX_FILE" -p "$OVSX_PAT"
info "Published to Open VSX"

# ── Cleanup ───────────────────────────────────────────────────────────────────
[ -f "$VSIX_FILE" ] && rm "$VSIX_FILE"

info "Cleaned up local .vsix"
echo ""
info "Release v$NEW_VERSION complete!"
info "VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=joesustaric.build-detective"
info "Open VSX: https://open-vsx.org/extension/joesustaric/build-detective"
info "GitHub Release: https://github.com/joesustaric/build-detective/releases/tag/v$NEW_VERSION"
