# Talk to Buildkite through the `bk` CLI so the extension never holds a credential

Every Buildkite interaction shells out to the `bk` binary — listing builds, viewing a build, fetching a job log, checking auth. The extension makes no HTTP calls to Buildkite at all, and that is the point rather than a side effect: the driving requirement is that this extension never possesses a Buildkite credential. `bk auth login --scopes "read_only"` performs OAuth and stores the result in an OS keyring, so there is no token in `SecretStorage`, no token in settings, no first-run token prompt, and nothing for us to rotate, leak, or explain when it goes missing. What it costs is a hard install prerequisite on a binary we don't ship, a subprocess on every poll, and a dependency on the CLI's `--json` output being as stable as an API contract.

## Considered Options

- **The REST API directly** — the queries map one-to-one onto what the CLI is already doing, and the code would be simpler without process spawning. Rejected because REST authenticates with a bearer token the caller must obtain and store itself, which makes us the custodian of the exact secret we didn't want to hold.
- **The GraphQL API** — would fetch a build, its jobs, and the triggered-build chain in one round trip instead of the current loop. Rejected on the same grounds, and worse: Buildkite documents that the scopes of GraphQL access tokens cannot be restricted, so there is no read-only story at all.
- **A hybrid — `bk` for auth, HTTP for data** — `bk auth token` will print the stored token, which would give us the CLI's login flow and a normal HTTP client. Rejected because the moment we read that token into our process we own it again, which defeats the whole decision.

## Consequences

The CLI must be present for the extension to function, which is why we install it for the user (see ADR 0003). We are also coupled to the CLI's command surface in a way an HTTP client would not be: a renamed or removed subcommand degrades into a dead panel rather than an error we can report, and every response shape we parse is one the CLI could reasonably change without considering it breaking. Commands must be built with an argument array rather than an interpolated shell string, because branch and pipeline names reach them unsanitised.
