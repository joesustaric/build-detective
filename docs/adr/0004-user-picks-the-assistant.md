# Show every available assistant and let the user pick; never rank them

Each failed job carries two buttons — "Ask Copilot" or "Ask Cursor" depending on the host editor, and "Ask Claude" — and the extension makes no attempt to decide which is best. Developers have strong, informed preferences about which assistant they want on a given problem, and many have several installed at once; silently routing to whichever we detect first is a worse outcome than asking, and an extra click is a small price for not overriding someone's choice of tool. Every available assistant gets surfaced; none of them gets promoted.

## Consequences

The two paths do not behave alike, and that asymmetry is imposed by the platforms rather than chosen. The Language Model API streams tokens back, so a Copilot or Cursor answer is rendered inside our own analysis panel; the Claude Code extension exposes only a one-way command that opens its own editor, so a Claude answer is handed off and we never see it. Cursor does not expose its native chat models through the Language Model API at all, so that path degrades to the clipboard. Adding an assistant therefore means deciding which of these three shapes it takes, and users will notice that "the answer appears in a different place" depending on the button — that is a permanent consequence of delegating rather than a defect to fix.

Because the API surfaces differ this much, platform workarounds accumulate in the request path. Request options are deliberately left empty: setting `toolMode` to `Auto` causes the stream to hang when the model makes a tool call. That deviation currently survives only as an assertion in `jobAnalyzer.test.ts`, which is exactly the kind of thing a future reader would "clean up" without it.
