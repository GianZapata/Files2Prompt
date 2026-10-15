# Contributing

## Architecture

The extension follows Clean Architecture:

- **Domain (`src/domain/`)**: Pure business logic with zero VS Code API dependencies.
  - `entities/`: Domain models and enums (`OutputFormat`, `GitChange`, `CopyStop`, etc.).
  - `datasources/`: Contracts for abstract data sources (`SettingsDataSource`, `WorkspaceFilesDataSource`, `GitDataSource`, `PromptOutputDataSource`, `StateDataSource`).
  - `repositories/`: Repository interfaces (`PromptRepository`, `GitChangesRepository`).
  - `use-cases/`: Encapsulated application use cases (`GeneratePrompt`, `DeliverPrompt`, `GetGitChanges`, `DiscoverGitRepositories`, `RecordSelection`).
  - `services/`: Pure business calculations and formatting rules (`PromptFormatsService`, `SelectionBudgetService`, `TokenEstimateService`, etc.).
- **Infrastructure (`src/infrastructure/`)**: Datasource and repository implementations interacting with VS Code, Node filesystem, git, and workspace state.
- **Presentation (`src/presentation/`)**: VS Code UI elements, tree view providers, status bar items, menus, commands, and dialogs.

## Release

Pushing a tag that starts with `v` runs `.github/workflows/publish.yml` in two jobs.

`verify` runs without any secrets. It checks that the tag matches the `version` in `package.json`, then runs lint, the format check, compile and the unit tests. Only if those pass does it package one VSIX and upload it.

`publish` starts after `verify`. It installs dependencies with `npm ci --ignore-scripts`, still without tokens in that step, downloads that same VSIX, and publishes it. Each token is visible only to its own publish step. Set these repository secrets first:

- `VSCE_PAT`: a Personal Access Token for the Visual Studio Marketplace publisher `gianzapata`.
- `OVSX_PAT`: an access token for Open VSX.

If a secret is missing, that registry is skipped with a warning and the job still passes.

Azure DevOps retires global PATs on 2026-12-01. After that date, publishing to the Marketplace requires `vsce publish --azure-credential` (Microsoft Entra ID) instead of `VSCE_PAT`.

To release, bump `version` in `package.json`, update `CHANGELOG.md`, commit, then tag:

```sh
git tag v1.0.0
git push origin v1.0.0
```
