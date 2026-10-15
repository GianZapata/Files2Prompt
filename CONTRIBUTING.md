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

## Branches

`main` is the only long-lived branch. Tags that start with `v` are cut only from `main`.

Everything else lives on a short branch and lands through a pull request:

- `feature/` for a new behavior
- `fix/` for a bug
- `chore/` for maintenance
- `docs/` for documentation

CI (`.github/workflows/ci.yml`) runs on every pull request and on every push to `main`. Merge a pull request only after that CI is green.

## Release

On `main`, bump `version` in `package.json`, add the section for that version to `CHANGELOG.md`, commit, and push `main`. Then tag that same commit:

```sh
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

Pushing a tag that starts with `v` runs `.github/workflows/publish.yml` in two jobs.

`verify` runs without any secrets. It rejects the tag when the tagged commit is not contained in `origin/main`. It also checks that the tag matches the `version` in `package.json`, then runs lint, the format check, compile and the unit tests. Only if those pass does it package one VSIX and upload it.

`publish` starts after `verify`. It installs dependencies with `npm ci --ignore-scripts`, still without tokens in that step, downloads that same VSIX, and publishes it. Each token is visible only to its own publish step. At the end it creates a GitHub Release for the tag, using the notes for that version from `CHANGELOG.md`, and attaches the VSIX. Set these repository secrets first:

- `VSCE_PAT`: a Personal Access Token for the Visual Studio Marketplace publisher `gianzapata`.
- `OVSX_PAT`: an access token for Open VSX.

If a secret is missing, that registry is skipped with a warning and the job still passes.

Azure DevOps retires global PATs on 2026-12-01. After that date, publishing to the Marketplace requires `vsce publish --azure-credential` (Microsoft Entra ID) instead of `VSCE_PAT`.
