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

export type ForcedRoot = {
  relativePath: string;
  pattern: string;
  sourceFile: string;
};

export type IgnoreDecision = {
  included: boolean;
  reason?: IgnoreReason;
  pattern?: string;
  sourceFile?: string;
  manual?: boolean;
};
