export type ChangeScope = 'uncommitted' | 'staged' | 'commit' | 'branch';

export type ChangeStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'submodule';

export type RawGitChange = {
  path: string;
  originalPath?: string;
  status: ChangeStatus | 'untracked';
  binary?: boolean;
  from?: string;
  to?: string;
  diff?: string;
};

export type PromptChange = {
  repo: string;
  path: string;
  status: ChangeStatus;
  scope?: ChangeScope;
  base?: string;
  head?: string;
  from?: string;
  to?: string;
  binary?: boolean;
  diff?: string;
};

export const changesForScope = (
  input: {
    repo: string;
    staged: RawGitChange[];
    working: RawGitChange[];
    untracked: RawGitChange[];
    commit: RawGitChange[];
    branch: RawGitChange[];
  },
  scope: ChangeScope
) => {
  const source =
    scope === 'uncommitted'
      ? [...input.staged, ...input.working, ...input.untracked]
      : scope === 'staged'
        ? input.staged
        : scope === 'commit'
          ? input.commit
          : input.branch;

  return source.map(change => toPromptChange(input.repo, change));
};

export const pathsToCheck = (changes: PromptChange[]) =>
  changes
    .filter(change => change.status === 'added' || change.status === 'modified')
    .map(change => change.path);

export const applyChangeSelection = (
  current: string[],
  changes: PromptChange[],
  mode: 'add' | 'replace'
) => {
  const next = pathsToCheck(changes);

  if (mode === 'replace') {
    return next;
  }

  return [...new Set([...current, ...next])];
};

export const baseChoices = (input: { upstream?: string; branches: string[] }) =>
  [
    input.upstream
      ? { label: input.upstream, kind: 'upstream' as const }
      : undefined,
    input.branches.includes('dev')
      ? { label: 'dev', kind: 'dev' as const }
      : undefined,
    input.branches.includes('main')
      ? { label: 'main', kind: 'main' as const }
      : undefined
  ].filter(
    (item): item is { label: string; kind: 'upstream' | 'dev' | 'main' } =>
      Boolean(item)
  );

export const mapGitStatus = (
  status: number
): RawGitChange['status'] | undefined => {
  if (status === 0 || status === 5 || status === 11) {
    return 'modified';
  }

  if (status === 1 || status === 7 || status === 9) {
    return status === 7 ? 'untracked' : 'added';
  }

  if (status === 2 || status === 6) {
    return 'deleted';
  }

  if (status === 3 || status === 10) {
    return 'renamed';
  }

  return undefined;
};

const toPromptChange = (repo: string, change: RawGitChange): PromptChange => {
  const status = change.status === 'untracked' ? 'added' : change.status;
  const path = prefix(repo, change.path);

  return {
    repo,
    path,
    status,
    from: change.originalPath ? prefix(repo, change.originalPath) : change.from,
    to: change.to,
    binary: change.binary,
    diff: change.diff
  };
};

const prefix = (repo: string, filePath: string) => {
  const relative = filePath.replace(/\\/g, '/').replace(/^\//, '');

  if (!repo || relative.startsWith(`${repo}/`) || relative === repo) {
    return relative;
  }

  return `${repo}/${relative}`;
};
