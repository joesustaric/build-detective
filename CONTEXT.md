# Build Detective

A VS Code and Cursor extension that tells you why your build broke, without leaving the editor. It reads CI results for the branch you're on and hands failed jobs to an AI assistant for explanation.

## Language

### CI concepts

**Build**:
One execution of a CI system against a specific commit. The thing that passes or fails, and the level this product is named after.
_Avoid_: Run, workflow run, job (a build contains jobs)

**Job**:
A single unit of work within a Build. The level at which failure is diagnosed — logs and analysis are always per-job.
_Avoid_: Step, task, stage

**Pipeline**:
The recurring *definition* that Builds are created from. Pipelines don't fail; the Builds they produce do. Rarely the right word in this codebase — reach for Build or Job first.
_Avoid_: Using "pipeline" to mean an individual Build

**Provider**:
A CI system this extension integrates with, e.g. Buildkite. Each lives behind its own module under `src/`, exposing the same shape to the rest of the extension.
_Avoid_: Integration, backend, source, CI system

### Product concepts

**Analysis**:
An AI-generated explanation of why a Job failed. The extension does not produce the explanation itself — it extracts the errors, builds a prompt, and delegates to an Assistant.
_Avoid_: Diagnosis, insight, summary

**Assistant**:
The AI the Analysis is delegated to — Copilot or Cursor via the editor's Language Model API, or Claude via the Claude Code extension or CLI. Which one is used depends on what the user has installed.
_Avoid_: Model, LLM, Copilot (Copilot is one Assistant, not the category)
