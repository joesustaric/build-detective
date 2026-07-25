# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- No functional changes; verifying the release pipeline end-to-end (version bump, tag, `.vsix` build, VS Code Marketplace and Open VSX publish, GitHub Release).

## [0.14.0] - 2026-07-25

### Added

- `CONTEXT.md` glossary defining the project's domain language.
- `docs/adr/` for architecture decision records, with authoring guidance in `AGENTS.md`.
- `build-detective.openSidebar` is now declared in `contributes.commands`, so it appears in the Command Palette. It was previously registered in code but undeclared.
- Published to the VS Code Marketplace and Open VSX (for Cursor and other Open VSX–based editors).
- `LICENSE` (MIT) and `CONTRIBUTING.md`.
- CI on GitHub Actions: lint, compile, and test on every pull request and push to `main`.

### Changed

- Renamed the extension to **Build Detective** (`build-detective`), displayed as "Build Detective for Buildkite". The package name stays provider-neutral so additional CI systems can be added without a marketplace rename — see `docs/adr/0001-generic-extension-name-buildkite-display-name.md`.
- Command IDs are now `build-detective.openPanel` and `build-detective.openSidebar`; the sidebar view container and view are `buildDetectiveSidebar` and `buildDetectiveView`.
- Listed under the **Testing** marketplace category instead of **Other**, with search keywords added.
- Lowered the minimum supported VS Code version from 1.105.0 to 1.91.0, the true floor for the APIs in use, so older Cursor builds aren't excluded unnecessarily.
- The status bar item now hides itself when the Buildkite CLI isn't found, instead of showing a permanent error, since the extension activates in every Git repository and most aren't Buildkite repos.
- Split the README: user-facing content stays in `README.md`; contributor setup, building, and releasing moved to `CONTRIBUTING.md`.

### Fixed

- Documentation stated a 10-second refresh interval; the actual interval is 20 seconds.
- Documentation described AI analysis as Copilot-only. Analysis is also delegated to Cursor's built-in AI, the Claude Code extension, or the `claude` CLI.
- README listed a Buildkite API token as a prerequisite and said users would be prompted for one. The extension never uses a token directly — it authenticates via the `bk` CLI, which was previously undocumented as a prerequisite.

## [0.1.0] - 2026-07-15

### Added

- Activity Bar sidebar for viewing pipeline builds and jobs from the current Git repository.
- Buildkite integration for listing builds, job details, and failed job logs.
- Automatic refresh on a polling interval and when the current branch or commit changes.
- Status bar indicator for the latest pipeline state with quick access to the sidebar.
- Job filtering controls and theme-aware UI for VS Code and Cursor.
- AI-assisted failure analysis for failed job logs through editor-supported language models.
- Direct links from the editor to builds and jobs in the pipeline provider UI.
- Local packaging and install workflow for development builds.
