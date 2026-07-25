# Generic extension name, provider-specific display name

The VS Code Marketplace treats `publisher.name` as an extension's permanent identity — changing `name` doesn't rename the extension, it creates a new one and forfeits every install, rating, and URL — whereas `displayName` can be changed freely on any release. We exploit that asymmetry: `name` is `build-detective`, which stays true no matter how many CI providers we add, while `displayName` is "Build Detective for Buildkite", which advertises what actually works today and can drop the suffix the moment a second provider ships. This matches the code, where provider-specific work is already isolated behind a module (`src/buildkite/`) and the rest of the extension is provider-agnostic.

The product is named after **Build**, not **Pipeline**, because a pipeline is a recurring definition and definitions don't fail — individual builds do. "Pipeline" was also the wrong level of the hierarchy in every provider's vocabulary, and collides on the marketplace with data-engineering tooling.

## Considered Options

- **Buildkite in both fields** (e.g. `buildkite-doctor`) — best discoverability, since people search the marketplace by provider, and honest about today's single integration. Rejected because the name becomes permanently false the day a second provider lands, and the only fix is starting the listing over.
- **Generic in both fields** — the previous state (`pipeline-log-analyser`). Safe forever but undiscoverable: nobody searches for "pipeline analyser", and it promised breadth the extension didn't have.
- **"Doctor" rather than "Detective"** — rejected because `flutter doctor`, `brew doctor`, and `expo doctor` have trained developers that "doctor" means *diagnose my local toolchain*, which is close to the opposite of what this extension does.

## Consequences

Discoverability now depends entirely on `displayName`, `description`, and `keywords` rather than on `name`. Those are all indexed by marketplace search and all freely editable, so they must be kept current as providers are added — the permanent `name` will never carry that weight.
