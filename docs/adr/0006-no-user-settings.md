# The extension contributes no user settings

There is no `contributes.configuration` block and nothing reads `workspace.getConfiguration`. The refresh interval is a constant, the default job-state filter is a constant, and the pipeline is discovered rather than configured (ADR 0005). This is a stance, not an omission: every setting is a support question, a migration burden, and a permanent commitment to honouring a value someone set once and forgot, and none of the tunables here has a defensible non-default. An extension that needs configuring to work is one that hasn't finished making a decision.

The job-state filter is the apparent exception and isn't one. It lives in `globalState` because it is UI state — a thing the user toggles in the panel while looking at the panel — not configuration. Putting it in settings would move a two-click control into the settings editor and make it something to sync and migrate.

## Consequences

Every constant becomes a decision we own rather than one we can push onto the user, so when a value turns out to be wrong for someone the fix is to change it for everyone, make it adapt, or accept the complaint. This is only tenable while the extension's assumptions hold on their own — which is why ADR 0005 chose discovery over a pipeline setting rather than leaving a hole this decision would have to fill.
