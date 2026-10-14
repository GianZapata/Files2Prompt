import type { PromptChangeStatus } from './git-change-status.enum';

export interface StoredForcedRoot {
  relativePath: string;
  pattern: string;
  sourceFile: string;
}

export interface StoredPromptChange {
  repo: string;
  path: string;
  status: PromptChangeStatus;
  diff?: string;
}

export interface SelectionSnapshot {
  files: string[];
  forcedRoots: StoredForcedRoot[];
  promptChanges: StoredPromptChange[];
}

export interface SelectionHistoryState {
  entries: Array<string[] | SelectionSnapshot>;
  position: number;
}
