export enum GitChangeStatus {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted',
  Renamed = 'renamed',
  Submodule = 'submodule',
  Untracked = 'untracked'
}

export type AnyGitChangeStatus = GitChangeStatus | `${GitChangeStatus}`;

export type PromptChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'submodule'
  | GitChangeStatus.Added
  | GitChangeStatus.Modified
  | GitChangeStatus.Deleted
  | GitChangeStatus.Renamed
  | GitChangeStatus.Submodule;
