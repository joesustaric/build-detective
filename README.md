# Build Detective

## 🚀 Overview

A VS Code and Cursor extension that tells you why your build broke, without leaving your editor. It tracks CI results for the branch you're on and hands failed jobs to an AI assistant for explanation.

> **Integrations:** The first supported CI/CD system is [Buildkite](https://buildkite.com/).

Analysis is delegated to whichever AI assistant you already have — Copilot or Cursor via the editor's Language Model API, or Claude via the Claude Code extension or the `claude` CLI. If none is available, the prompt is copied to your clipboard.

## 📦 Installing the Extension

> For users who want to install the pre-built extension.

**Prerequisites (both editors):**
- A [Buildkite API token](https://buildkite.com/user/api-access-tokens) with read access
- AI analysis requires at least one assistant: GitHub Copilot, Cursor's built-in AI, the Claude Code extension, or the `claude` CLI on your `PATH`.

### VS Code

1. Go to the [latest GitHub Release](https://github.com/joesustaric/build-detective/releases/latest)
2. Download the `.vsix` file (e.g. `build-detective-0.3.0.vsix`)
3. Open the **Extensions** view (`Cmd+Shift+X`)
4. Click the `...` menu (top-right of the Extensions panel) → **Install from VSIX...**
5. Select the downloaded `.vsix` file

Or install via the terminal:

```bash
code --install-extension build-detective-X.Y.Z.vsix
```

Once installed, open a repository. The **Build Detective** icon will appear in the Activity Bar. You'll be prompted for your Buildkite API token on first use.

### Cursor

1. Go to the [latest GitHub Release](https://github.com/joesustaric/build-detective/releases/latest)
2. Download the `.vsix` file (e.g. `build-detective-0.3.0.vsix`)
3. Open the **Extensions** view (`Cmd+Shift+X`)
4. Click the `...` menu (top-right of the Extensions panel) → **Install from VSIX...**
5. Select the downloaded `.vsix` file

Or install via the terminal:

```bash
cursor --install-extension build-detective-X.Y.Z.vsix
```

Once installed, open a repository. The **Build Detective** icon will appear in the Activity Bar. You'll be prompted for your Buildkite API token on first use.

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
- A [Buildkite API token](https://buildkite.com/user/api-access-tokens) with read access
- An AI assistant for analysis: GitHub Copilot, Cursor's built-in AI, the Claude Code extension, or the `claude` CLI

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

- Call Buildkite API to get jobs related to opened branch
- Ask your AI assistant to analyse an error from a failed job

### Development

#### VS Code

1. Run `pnpm run compile`.
1. Press `F5` or click **Run and Debug** to launch the extension host.
1. In the new VS Code window, open a repository on a branch with Buildkite builds.
1. Open the **Build Detective** panel in the Activity Bar sidebar.
1. Enter your Buildkite API token when prompted.

#### Cursor

1. Run `pnpm run compile`.
1. Press `F5` or click **Run and Debug** to launch the extension host.
1. In the new Cursor window, open a repository on a branch with Buildkite builds.
1. Open the **Build Detective** panel in the Activity Bar sidebar.
1. Enter your Buildkite API token when prompted.

## ✨ Features

- **Buildkite build status** — automatically fetches builds for the currently checked-out branch
- **Auto-refresh** — polls Buildkite every 20 seconds and updates on branch changes
- **AI failure analysis** — click **Analyze** on any failed job to get an AI-powered explanation via Copilot, Cursor, or Claude
- **Direct links** — open builds directly in the Buildkite web UI from the sidebar

## 🔨 Building the Extension

> For contributors who want to produce a `.vsix` locally without releasing.

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
- On the `main` branch with a clean working tree
- All tests passing

**Steps:**

1. Add your release notes to `CHANGELOG.md` under `## [Unreleased]`
   - Use `### Added`, `### Fixed`, `### Changed` subsections per [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
2. Run the release script:
   ```bash
   ./scripts/release.sh
   ```
3. Select the bump type when prompted (`major` / `minor` / `patch`)

The script will:
- Run all tests
- Bump the version in `package.json`
- Promote `[Unreleased]` to the new version in `CHANGELOG.md`
- Commit, tag, and push to `main`
- Build the `.vsix`
- Publish a GitHub Release with the `.vsix` as a downloadable asset

## 📚 Additional Information

- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Buildkite API Docs](https://buildkite.com/docs/apis/rest-api)
