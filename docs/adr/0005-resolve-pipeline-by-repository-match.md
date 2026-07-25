# Resolve the pipeline by matching its repository, not by assuming the repo name is the slug

The extension currently takes the directory name out of the git origin URL and uses it directly as the Buildkite pipeline slug. That is a convention, not a guarantee — a pipeline's slug derives from its name, which is independent of the repository it builds, and one repository can back several pipelines. When the guess is wrong the failure is invisible: the lookup returns nothing, the panel reports "No builds found for this branch", and the user has a working-looking extension that will never show anything. We are replacing the guess with discovery: ask Buildkite which pipelines exist and match on the `repository` field against the git origin, which is the fact that actually connects the two.

Discovery is chosen over a configuration setting deliberately. A setting would work, but it moves the burden onto every user to notice a silent failure and then find the knob that fixes it, and it puts the first crack in the no-settings stance recorded in ADR 0006. Matching on repository keeps the extension zero-config in the common case while being correct in the cases the convention never covered.

## Consequences

Resolution now costs an extra lookup at startup and on repository change, and it introduces an ambiguous case the convention never had: when several pipelines build the same repository, the extension has to choose or ask. Whichever it does, the outcome must be legible — the failure this decision exists to eliminate is the silent empty panel, so "no pipeline builds this repository" has to be said out loud rather than rendered as an absence of builds.
