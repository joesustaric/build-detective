# Contributing

## 🛠️ Technology Stack

| Technology                                                                                                                                     | Purpose               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)        | Type-safe development |
| [![VS Code API](https://img.shields.io/badge/VS%20Code%20API-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/api) | Extension platform    |
| [![Buildkite](https://img.shields.io/badge/Buildkite-14CC80?logo=buildkite&logoColor=white)](https://buildkite.com/)                           | CI/CD data source     |
| [![Jest](https://img.shields.io/badge/Mocha-8D6748?logo=mocha&logoColor=white)](https://mochajs.org/)                                          | Testing framework     |

## 🚀 Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) installed
- [mise](https://mise.jdx.dev/getting-started.html) for managing Node.js versions (recommended)
- The [Buildkite CLI](https://buildkite.com/docs/packages/cli) (`bk`), authenticated with `bk auth login --scopes "read_only"`

### Install mise (environment manager)

This project uses [mise](https://mise.jdx.dev/) to manage the Node.js and pnpm versions (see `.mise.toml`).

```bash
# macOS
brew install mise

# Activate mise in your shell (add to ~/.zshrc or ~/.bashrc)
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

See the [mise getting started guide](https://mise.jdx.dev/getting-started.html) for other install methods.

### Clone & Install Dependencies

```bash
git clone git@github.com:joesustaric/build-detective.git
cd build-detective

mise install   # install Node.js and pnpm versions defined in .mise.toml
pnpm install   # install packages
```

### Development Commands

```bash
pnpm compile   # Compile TypeScript
pnpm watch     # Compile with watch mode (hot reload)
pnpm test      # Run all tests
pnpm lint      # Run ESLint
```

### Running the Extension Locally

#### VS Code

1. Run `pnpm run compile`.
1. Press `F5` or click **Run and Debug** to launch the extension host.
1. In the new VS Code window, open a repository on a branch with Buildkite builds.
1. Open the **Build Detective** panel in the Activity Bar sidebar.

#### Cursor

1. Run `pnpm run compile`.
1. Press `F5` or click **Run and Debug** to launch the extension host.
1. In the new Cursor window, open a repository on a branch with Buildkite builds.
1. Open the **Build Detective** panel in the Activity Bar sidebar.

Or install a locally built `.vsix` into your own VS Code / Cursor without the extension host:

```bash
./scripts/install-local.sh
```

## 🔨 Building the Extension

> Produce a `.vsix` locally without releasing.

**Prerequisites:** Node.js (via `mise install`), `pnpm install` completed.

```bash
pnpm compile
pnpm exec vsce package
# Produces: build-detective-X.Y.Z.vsix
```

## 🚢 Releasing

> For maintainers cutting a new release.

**Prerequisites:**
- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [1Password CLI](https://developer.1password.com/docs/cli/) installed and signed in (`op`)
- Two items in your `Personal` 1Password vault, each holding a token in the `credential` field:
  - `VS Code Marketplace` — an Azure DevOps PAT scoped to *Marketplace → Manage*, "all accessible organizations"
  - `Open VSX` — an access token from your Open VSX user settings
  - (Different vault or item names? Update the `op://` paths at the top of `scripts/release.sh`.)
- On the `main` branch with a clean working tree
- All tests passing

**Steps:**

1. Add your release notes to `CHANGELOG.md` under `## [Unreleased]`
   - Use `### Added`, `### Fixed`, `### Changed` subsections per [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
2. Run the release script:
   ```bash
   ./scripts/release.sh
   ```
3. Select the bump type when prompted (`major` / `minor` / `patch`), or enter an explicit version

The script will:
- Run all tests
- Bump the version in `package.json`
- Promote `[Unreleased]` to the new version in `CHANGELOG.md`
- Commit, tag, and push to `main`
- Build the `.vsix`
- Publish to the VS Code Marketplace and Open VSX
- Publish a GitHub Release with the `.vsix` as a downloadable asset

## 📐 Architecture Decision Records

See `AGENTS.md` for how and when to write an ADR. Existing ones live in `docs/adr/`.
