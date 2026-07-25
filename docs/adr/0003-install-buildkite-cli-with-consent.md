# Install the Buildkite CLI for the user, but only after they approve the command

Because ADR 0002 makes `bk` a hard prerequisite, a missing CLI is the difference between a working extension and a dead panel, and "go install this and come back" loses people at first run. So the extension offers to install it — `brew install buildkite/buildkite/bk@3`, or `winget install buildkite.bk` on Windows — but shows the exact command and waits for approval before running anything. Silently invoking someone's package manager is the kind of surprise that is remembered as a violation no matter how convenient it was, and the consent step costs one click against an install the user was going to have to do anyway.

## Consequences

Installation can still fail in ways we can't fix — no Homebrew, no winget, a corporate machine that forbids both — so the "install it yourself" path has to remain a first-class, well-signposted state rather than a fallback error message.
