# Files2Prompt Fork

Local fork of [Thomas-McKanna/Files2Prompt](https://github.com/Thomas-McKanna/Files2Prompt), maintained by Gian Zapata. This is not the Marketplace extension `thomas-mckanna.files2prompt`. Install the local VSIX so editor updates do not replace it with upstream.

Original project: [Thomas-McKanna/Files2Prompt](https://github.com/Thomas-McKanna/Files2Prompt). License: MIT, Copyright 2024 Thomas McKanna.

[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/GianZapata/Files2Prompt)

Copy file contents in XML format for LLM prompts effortlessly.

![Demo](demo.gif)

## Features

- **Visual File Tree**: Browse and select files within your workspace using an intuitive tree view.
- **Selective Copying**: Easily choose which files to include in the copy operation with checkboxes.
- **XML Formatting**: Copies the content of selected files wrapped in XML `<file>` elements, ready for use in LLM prompts or other applications.
- **Custom System Message**: Optionally include a system message in your copied output, encapsulated within a `<systemMessage>` XML element.
- **Configurable Shortcuts**: Quickly refresh the file tree or copy files using customizable keyboard shortcuts.
- **Git Ignore Support**: Automatically ignores files and directories specified in your .gitignore.
- **Prompt Ignore**: `.promptignore` controls what is copied into an LLM prompt. It does not replace `.gitignore`. A `!` rule cannot bring back a file while its parent directory stays excluded.
- **Selection History**: Quickly switch between sets of previously selected files.
- **Paste XML Response**: If XML is pasted into the editor in the same format as the copied output, the files will automatically be updated or created in your workspace. This allows for rapid iteration. See [recommended workflow](#recommended-workflow) for more information.

## Installation

Install this fork from a local VSIX only. Do not install `thomas-mckanna.files2prompt` from the Marketplace. An editor update can replace this fork with upstream if the Marketplace copy is installed.

1. Build or download the local `.vsix`.
2. In VS Code, press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) to open the Command Palette.
3. Type `Extensions: Install from VSIX...` and select the command.
4. Browse to the `.vsix` file and install.

## Usage

### Open Files2Prompt View:

- Click on the Files2Prompt icon in the Activity Bar to open the Files2Prompt view.

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

### Refresh File Tree:

- To refresh the file tree view, click the Refresh button or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+R`
  - macOS: `Cmd+R`

### Clear Selection:

- To clear all file selections, click the Clear Selection button or use the keyboard shortcut:
  - Windows/Linux: `Ctrl+Shift+X`
  - macOS: `Cmd+Shift+X`

### Paste XML Response:

- To update or create files in your workspace from LLM-outputted XML content, use the following keyboard shortcut while the extension UI is active:
  - Windows/Linux: `Ctrl+V`
  - macOS: `Cmd+V`

It is recommended that if you use this feature you have a custom system message (see section below) to ensure that the XML content is correctly formatted. Here is an example of such a system message:

```
Always provide full code listings. You only need to include files that have changed. I repeat, ALWAYS provide full code listings. Your output should be in XML format (in a code block) that mirrors the input format (that is, `<files>` element with a list of `<file>` in the interior).
```

### Include System Message:

1. Go to Settings (`Ctrl+,` or `Cmd+,` on macOS).
2. Navigate to Extensions > Files2Prompt.
3. Enter your custom system message in the System Message field.
4. When you copy files, this message will be included at the top of the XML output.

See recommended system message above.

## Configuration

### Customizing Keyboard Shortcuts

You can customize the keyboard shortcuts for refreshing and copying files:

1. Open Keyboard Shortcuts:
   - Press `Ctrl+K Ctrl+S` (`Cmd+K Cmd+S` on macOS).
2. Search for "Files2Prompt: Refresh" and "Files2Prompt: Copy Files".
3. Click on the desired command and press the new key combination you wish to assign.

### Setting a Custom System Message

1. Open Settings:
   - Press `Ctrl+,` (`Cmd+,` on macOS).
2. Navigate to Extensions > Files2Prompt.
3. Enter your desired system message in the System Message field.
4. If left empty, no system message will be included in the copied output.

## Example Output

```xml
<files>
  <systemMessage>
  <![CDATA[
  This is a custom system message for LLM prompts.
  ]]>
  </systemMessage>
  <file name="src/extension.ts">
    <![CDATA[
    // File content here
    ]]>
  </file>
  <file name="README.md">
    <![CDATA[
    # Readme content here
    ]]>
  </file>
</files>
```

## Git changes and multiple repositories

A launcher folder can hold several repositories. Files2Prompt lists each repository root with its branch, and a submodule with its branch or short commit. A worktree inside an ignored folder, such as `launcher/web/.worktrees/feature-structure-01`, is not listed.

Select Git changes from the view title or from a repository root:

- Uncommitted changes: staged, working tree, and untracked files.
- Staged changes only.
- One commit.
- The current branch against a base. The picker proposes the upstream, `dev`, or `main` when those exist.

With more than one repository, pick which ones to include. Then add to the selection or replace it. Deleted and renamed paths stay in the diff and are not checked in the tree.

`files2prompt.diffMode` controls the prompt:

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

Paste XML ignores `<changes>` and writes only `<file>` entries. A submodule pointer change uses `status="submodule"` with `from` and `to`.

## Recommended Workflow

The Files2Prompt extension allows for a rapid iterative workflow when working with an LLM. It is first recommended that you set the system message setting to that described [above](#include-system-message). This will ensure that the XML content is correctly formatted when pasted back into the editor.

Next, create a file called `prompt` in the root of your repository. You will want to add this to `.gitignore`. This file acts as a scratchpad for you latest prompt.

Optionally, create a directory called `docs` (also in `.gitignore`) where you can paste documentation into files for any technologies or code that is related to your project.

Then, a single iteration of the workflow might look like this:

1. Alter the `prompt` file with you desired next state.
2. Open the Files2Prompt view and select `prompt` and any other files that are relevant to your prompt. Also select any relevant documentation files from the `docs` directory.
3. Copy your XML prompt with the keyboard shortcut or button.
4. Paste the content into the LLM and submit.
5. Copy the LLM contents, which should be in XML format if you followed the system message instructions.
6. With the Files2Prompt view open, paste the LLM content with the keyboard shortcut or press the "play" icon in the UI. This will update the file contents or make brand new files.
7. Loop back to step 1.
