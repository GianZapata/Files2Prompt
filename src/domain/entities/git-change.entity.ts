import type { AnyChangeSelectionMode } from './change-selection-mode.enum';
import type {
  AnyGitChangeStatus,
  PromptChangeStatus
} from './git-change-status.enum';
import type { AnyGitScope } from './git-scope.enum';
import type { AnyRepositoryKind } from './repository-kind.enum';

export interface GitSubmoduleRecord {
  path: string;
  branch?: string;
  commit?: string;
}

export interface GitRepositoryRecord {
  rootPath: string;
  branch?: string;
  commit?: string;
  submodules?: GitSubmoduleRecord[];
}

export interface DiscoveredRepository {
  relativePath: string;
  kind: AnyRepositoryKind;
  branch?: string;
  commit?: string;
}

export interface RawGitChange {
  path: string;
  originalPath?: string;
  status: AnyGitChangeStatus;
  binary?: boolean;
  from?: string;
  to?: string;
  diff?: string;
}

export interface PromptChange {
  repo: string;
  path: string;
  status: PromptChangeStatus;
  scope?: AnyGitScope;
  base?: string;
  head?: string;
  from?: string;
  to?: string;
  binary?: boolean;
  diff?: string;
}

export interface GitChangeSelection {
  changes: PromptChange[];
  mode: AnyChangeSelectionMode;
}
