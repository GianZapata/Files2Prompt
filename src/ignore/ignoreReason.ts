export enum IgnoreReason {
  BuiltIn = 'built-in',
  Gitignore = 'gitignore',
  Promptignore = 'promptignore',
  WorkspaceExclude = 'workspace-exclude',
  IgnoredExtension = 'ignored-extension',
  Binary = 'binary',
  FileSize = 'file-size',
  Symlink = 'symlink'
}

export type IgnoreDecision = {
  included: boolean;
  reason?: IgnoreReason;
  pattern?: string;
};
