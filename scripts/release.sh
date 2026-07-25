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
"$REPO_ROOT/node_modules/.bin/vsce" --version >/dev/null 2>&1 \
  || error "'vsce' not found in node_modules. Run: pnpm install"

gh auth status >/dev/null 2>&1 || error "Not authenticated with gh. Run: gh auth login"

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
select BUMP_TYPE in major minor patch; do
  [ -z "$BUMP_TYPE" ] && error "No bump type selected."
  case $BUMP_TYPE in
    major|minor|patch) break ;;
    *) echo "Select 1, 2, or 3" ;;
  esac
done

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

# ── Cleanup ───────────────────────────────────────────────────────────────────
[ -f "$VSIX_FILE" ] && rm "$VSIX_FILE"

info "Cleaned up local .vsix"
echo ""
info "Release v$NEW_VERSION complete!"
info "Install from: https://github.com/joesustaric/build-detective/releases/tag/v$NEW_VERSION"
