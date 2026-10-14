# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-14

### Added

- Output formats: XML, Markdown and plain text, with Copy as…, Save as… and Copy as File….
- Git changes from one or several repositories: uncommitted, staged, one commit, or the current branch against a base.
- Token estimate in the status bar, tooltips and details, plus an optional `files2prompt.tokenBudget` warning.
- Generated files (lockfiles, `*.min.js`, `*.min.css`, `*.map`) stay out of bulk selection. `files2prompt.includeGenerated` brings them back.
- A tree of the selected files at the top of the prompt (`files2prompt.includeTree`).
- Optional whitespace compaction for file contents (`files2prompt.compactWhitespace`).
- Protection for secrets: a sensitive level that never reaches the prompt, with `files2prompt.allowSensitive` as the explicit exception.
- CI on Linux, macOS and Windows.

### Changed

- The tree is on by default in the output. Set `files2prompt.includeTree` to `false` to go back to the old prompt layout.

### Removed

- Paste, which pasted XML back into the workspace.

### Security

- Sensitive files such as credentials and keys are never included, in files or in diffs.
- Links that point outside the workspace are skipped.

[2.0.0]: https://github.com/GianZapata/Files2Prompt/releases/tag/v2.0.0
