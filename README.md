# Build Detective

## 🚀 Overview

A VS Code and Cursor extension that tells you why your build broke, without leaving your editor. It tracks CI results for the branch you're on and hands failed jobs to an AI assistant for explanation.

> **Integrations:** The first supported CI/CD system is [Buildkite](https://buildkite.com/).

Analysis is delegated to whichever AI assistant you already have — Copilot or Cursor via the editor's Language Model API, or Claude via the Claude Code extension or the `claude` CLI. If none is available, the prompt is copied to your clipboard.

<!-- TODO: add a screenshot of the sidebar showing failed jobs, e.g. images/screenshot-sidebar.png -->

## ✨ Features

- **Buildkite build status** — automatically fetches builds for the currently checked-out branch
- **Auto-refresh** — polls Buildkite every 20 seconds and updates on branch changes
- **AI failure analysis** — click **Analyze** on any failed job to get an AI-powered explanation via Copilot, Cursor, or Claude
- **Direct links** — open builds directly in the Buildkite web UI from the sidebar

## 📦 Installing

**Prerequisites:**
- The [Buildkite CLI](https://buildkite.com/docs/packages/cli) (`bk`) — the extension will offer to install it for you and walk you through `bk auth login` on first use
- AI analysis requires at least one assistant: GitHub Copilot, Cursor's built-in AI, the Claude Code extension, or the `claude` CLI on your `PATH`

### VS Code

Install [Build Detective for Buildkite](https://marketplace.visualstudio.com/items?itemName=joesustaric.build-detective) from the VS Code Marketplace, or run:

```bash
code --install-extension joesustaric.build-detective
```

### Cursor

Install [Build Detective for Buildkite](https://open-vsx.org/extension/joesustaric/build-detective) from Open VSX (Cursor's default extensions source), or run:

```bash
cursor --install-extension joesustaric.build-detective
```

### From a `.vsix` (offline, or a specific version)

Download the `.vsix` from the [latest GitHub Release](https://github.com/joesustaric/build-detective/releases/latest), then:

```bash
code --install-extension build-detective-X.Y.Z.vsix
# or
cursor --install-extension build-detective-X.Y.Z.vsix
```

Once installed, open a repository. The **Build Detective** icon appears in the Activity Bar.

## 🔒 Your data

- The extension never stores or handles a Buildkite credential. All Buildkite access goes through the `bk` CLI, which authenticates via OAuth into your OS keyring — see [ADR 0002](docs/adr/0002-buildkite-cli-transport-no-stored-credential.md).
- Build and job logs are scanned and redacted for API tokens before they're used anywhere, including in prompts sent to an assistant.
- There is no Build Detective backend. Log excerpts are sent only to the AI assistant you already have installed and configured — Copilot, Cursor, or Claude — and nowhere else.
- The extension collects no telemetry or analytics.

## 📚 Additional Information

- [Contributing](CONTRIBUTING.md) — building, testing, and releasing
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Buildkite API Docs](https://buildkite.com/docs/apis/rest-api)
