export enum GitScope {
  Uncommitted = 'uncommitted',
  Staged = 'staged',
  Commit = 'commit',
  Branch = 'branch'
}

export type AnyGitScope = GitScope | `${GitScope}`;
