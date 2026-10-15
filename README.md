# Promptfold

[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/GianZapata/Files2Prompt)

Copy files and Git changes as XML, Markdown or plain text for LLM prompts, with an estimate of the tokens they use. No telemetry, no network access.

<!-- screenshots: add before publishing -->

## Features

- **Output formats**: XML, Markdown or plain text, with the format switchable from the view.
- **Copy and save**: copy to the clipboard, Save as…, Copy as File…, Preview and Show details.
- **Flexible selection**: the whole project, by extension, open files, or a folder or file from Explorer.
- **Git changes**: uncommitted, staged, one commit, or the current branch against a base, as a diff before the files.
- **Several repositories**: a launcher folder with many repositories and submodules, each with its branch.
- **Ignored folders on demand**: check a folder from `.gitignore` to include it, after one confirmation.
- **Secret protection**: credentials and keys are never included, `allowSensitive` is the explicit way around it, and links that leave the workspace are skipped.
- **Generated files**: lockfiles and minified files stay out of bulk selection.
- **Token estimate**: status bar, tooltips and details, with an optional `tokenBudget` warning.
- **Structure tree**: the selected files laid out as a tree at the top of the prompt.
- **Whitespace compaction**: optional trimming of file contents.
- **Selection history**: move back and forth between previous selections.
- **Ignore rules**: `.gitignore` plus `.promptignore`, which controls only what goes into a prompt. A `!` rule cannot bring back a file while its parent directory stays excluded.
- **System message**: an optional message at the top of the prompt.
- **Shortcuts**: refresh, copy and clear selection, all remappable.

## Installation

Install Promptfold from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gianzapata.promptfold) or from [Open VSX](https://open-vsx.org/extension/gianzapata/promptfold): search for "Promptfold" in the Extensions view.

To install a `.vsix` instead:

1. Download the `.vsix` file.
2. In VS Code, press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) to open the Command Palette.
3. Type `Extensions: Install from VSIX...` and select the command.
4. Browse to the `.vsix` file and install.

## Usage

### Open Promptfold View:

- Click on the Promptfold icon in the Activity Bar to open the Promptfold view.

### Select the whole project:

- Use **Select all** in the view title. Ignored folders stay out. A large selection asks before copying and can copy only what fits.

### Select by extension:

- Use **Select by extension** on the view, on a folder in the tree, or on a folder in Explorer.
- Matching uses the file suffix, so `.blade.php` matches `foo.blade.php` and `php` also matches that file. `.env` is the suffix of the dotfile. A file with no dot matches only the no-extension choice.

### Include an ignored folder:

- Check a folder listed in `.gitignore`. Confirm once to include its files. `.promptignore`, generated folders, binaries, and size limits still win. Nested `node_modules/` stays out.

### Select Files:

- Browse through your workspace's file tree.
- Check the boxes next to the files you want to copy.

### Copy Files:

- Click the Copy Files button in the view's title bar or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+C`
  - macOS: `Cmd+C`

### Save Prompt As:

- Click **Save as…** in the view's title bar or the Command Palette (`Promptfold: Save as…`).
- Select the destination file path and format (`.xml`, `.md`, or `.txt`).
- Once saved, open the resulting file directly from the completion notification.

### Refresh File Tree:

- To refresh the file tree view, click the Refresh button or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+R`
  - macOS: `Cmd+R`

### Clear Selection:

- To clear all file selections, click the Clear Selection button or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+Shift+X`
  - macOS: `Cmd+Shift+X`

### Include System Message:

1. Go to Settings (`Ctrl+,` or `Cmd+,` on macOS).
2. Navigate to Extensions > Promptfold.
3. Enter your custom system message in the System Message field.
4. When you copy files, this message will be included at the top of the output.

See recommended system message above.

## Configuration

### Customizing Keyboard Shortcuts

You can customize the keyboard shortcuts for refreshing and copying files:

1. Open Keyboard Shortcuts:
   - Press `Ctrl+K Ctrl+S` (`Cmd+K Cmd+S` on macOS).
2. Search for "Promptfold: Refresh" and "Promptfold: Copy Files".
3. Click on the desired command and press the new key combination you wish to assign.

### Setting a Custom System Message

1. Open Settings:
   - Press `Ctrl+,` (`Cmd+,` on macOS).
2. Navigate to Extensions > Promptfold.
3. Enter your desired system message in the System Message field.
4. If left empty, no system message will be included in the copied output.

## Tokens and size

Promptfold estimates the size of a prompt as characters divided by four. The figure is approximate, so it shows as `~12.3k tokens`, never as an exact count.

- **Status bar.** Shows the file count and the estimated tokens of the current selection (calculated from file sizes). When `promptfold.tokenBudget` is above 0 and the selection goes over it, the item turns to a warning color.
- **Details.** After a copy, "Show details" reports the estimate for the full prompt (files, tree, diffs and wrapper) and lists the ten heaviest files.
- **Tooltip.** Hover a file in the tree to see its size and estimated tokens.
- **`promptfold.tokenBudget`.** Warns before copying a prompt estimated above this many tokens. Default `0` (off). The warning offers "Copy anyway" and "Do not ask again in this workspace". If the selection also goes over `maxTotalBytes`, only the size warning shows.
- **`promptfold.includeGenerated`.** Lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`, `Cargo.lock`, `go.sum` and similar) and `*.min.js`, `*.min.css` and `*.map` stay out when you select a folder, the whole project, an extension or Git changes. A file you check on its own is always included. Their diffs are replaced with a "diff omitted" mark. Default `false`.
- **`promptfold.includeTree`.** Adds the tree of the selected files before the diffs (`<tree>` in XML, `## Structure` in Markdown, `=== TREE ===` in plain text). It counts toward `maxTotalBytes` and the estimate. A file cut by that limit is not listed. Default `true`.
- **`promptfold.compactWhitespace`.** Converts CRLF to LF, strips trailing spaces and shrinks runs of two or more blank lines to one, in file contents only. Indentation and diffs are never touched. Markdown hard line breaks (two trailing spaces) are lost. Default `false`.

## Example Output

Both examples come from `npm run compile && node scripts/readme-example.mjs <xml|markdown>`, run over the test fixture with the tree on and one Git change.

XML:

```xml
<files><systemMessage><![CDATA[Review these changes and suggest fixes.]]></systemMessage><tree><![CDATA[web/
  docs/
    mi archivo.md
  src/
    app.ts]]></tree><changes repo="web" scope="uncommitted"><change path="web/docs/mi archivo.md" status="modified"><![CDATA[diff --git a/docs/mi archivo.md b/docs/mi archivo.md
index 4387e04..467b83a 100644
--- a/docs/mi archivo.md
+++ b/docs/mi archivo.md
@@ -1,3 +1,3 @@
 # Guía

-Primera versión.
+Segunda versión con acción.]]></change></changes><file name="web/docs/mi archivo.md"><![CDATA[# Guía

Segunda versión con acción.
]]></file><file name="web/src/app.ts"><![CDATA[export const app = 'web';
]]></file></files>
```

Markdown:

````markdown
Review these changes and suggest fixes.

## Structure

```text
web/
  docs/
    mi archivo.md
  src/
    app.ts
```

## Git changes — web (uncommitted, — → HEAD)

### web/docs/mi archivo.md (modified)

```diff
diff --git a/docs/mi archivo.md b/docs/mi archivo.md
index 4387e04..467b83a 100644
--- a/docs/mi archivo.md
+++ b/docs/mi archivo.md
@@ -1,3 +1,3 @@
 # Guía

-Primera versión.
+Segunda versión con acción.
```

### web/docs/mi archivo.md

```markdown
# Guía

Segunda versión con acción.
```

### web/src/app.ts

```ts
export const app = 'web';
```
````

## Git changes and multiple repositories

A launcher folder can hold several repositories. Promptfold lists each repository root with its branch, and a submodule with its branch or short commit. A worktree inside an ignored folder, such as `launcher/web/.worktrees/feature-structure-01`, is not listed.

Select Git changes from the view title or from a repository root:

- Uncommitted changes: staged, working tree, and untracked files.
- Staged changes only.
- One commit.
- The current branch against a base. The picker proposes the upstream, `dev`, or `main` when those exist.

With more than one repository, pick which ones to include. Then add to the selection or replace it. Deleted and renamed paths stay in the diff and are not checked in the tree.

`promptfold.diffMode` controls the prompt:

- `diffAndFiles` puts a `<changes>` block before the full `<file>` entries. This is the default.
- `diffOnly` copies the diff and not the full files.
- `filesOnly` copies the files and not the diff.

```xml
<files>
  <changes repo="launcher/api" scope="branch" base="dev" head="feature/example">
    <change path="launcher/api/app/Foo.php" status="modified"><![CDATA[unified diff]]></change>
  </changes>
  <file name="launcher/api/app/Foo.php"><![CDATA[full file]]></file>
</files>
```

A submodule pointer change uses `status="submodule"` with `from` and `to`.

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

## Recommended Workflow

Copy the selected files into the LLM, then edit the project yourself from the reply.

1. Open the Files view and select the files that belong in the prompt.
2. Copy them with the button or the keyboard shortcut.
3. Paste that prompt into the LLM and submit.
4. Apply the reply in the editor.
5. Repeat.

## Contributing

### Release

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

## Credits

Promptfold is based on [Files2Prompt](https://github.com/Thomas-McKanna/Files2Prompt) by Thomas McKanna, released under the MIT license. See [LICENSE.md](LICENSE.md).
