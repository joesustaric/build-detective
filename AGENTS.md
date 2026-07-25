# AGENTS.md

Guidance for coding agents working in this repo.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `joesustaric/build-detective`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Architecture Decision Records

ADRs live in `docs/adr/`, numbered sequentially: `0001-slug.md`, `0002-slug.md`. To add one, scan the directory for the highest number and increment.

### When to write one

All three must be true. If any is missing, skip it.

1. **Hard to reverse** — changing your mind later carries real cost.
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **A real trade-off** — there were genuine alternatives and one was picked for specific reasons.

Easy to reverse? You'll just reverse it. Not surprising? Nobody will wonder. No alternative? Nothing to record beyond "we did the obvious thing."

Things that qualify here: the provider seam (how a new CI system gets added), how AI assistants are selected and fanned out to, anything about the marketplace identity, and deliberate deviations a reader would otherwise "fix".

### Format

A single paragraph is a complete ADR. The value is recording *that* a decision was made and *why*, not filling out sections.

```md
# {Short title of the decision}

{1-3 sentences: the context, the decision, and why.}
```

Add `## Considered Options` only when the rejected alternatives are worth remembering, and `## Consequences` only when there are non-obvious downstream effects. Most ADRs need neither. Add a `Status` line (`proposed | accepted | superseded by ADR-NNNN`) only once a decision actually gets revisited.

### Domain language

`CONTEXT.md` is the glossary and *only* the glossary — no implementation detail, no specs, no scratch notes. When a term gets resolved during a session, write it there immediately rather than batching it up. Be opinionated: when several words compete for one concept, pick one and list the rest under `_Avoid_`.
