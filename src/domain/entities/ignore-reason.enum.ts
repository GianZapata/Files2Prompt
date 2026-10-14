export enum IgnoreReason {
  BuiltIn = 'built-in',
  Gitignore = 'gitignore',
  Promptignore = 'promptignore',
  WorkspaceExclude = 'workspace-exclude',
  IgnoredExtension = 'ignored-extension',
  Binary = 'binary',
  FileSize = 'file-size',
  Symlink = 'symlink',
  SavedPrompt = 'saved-prompt',
  Sensitive = 'sensitive'
}

export interface ForcedRoot {
  relativePath: string;
  pattern: string;
  sourceFile: string;
}

export interface IgnoreDecision {
  included: boolean;
  reason?: IgnoreReason;
  pattern?: string;
  sourceFile?: string;
  manual?: boolean;
}
