export type GitSubmoduleRecord = {
  path: string;
  branch?: string;
  commit?: string;
};

export type GitRepositoryRecord = {
  rootPath: string;
  branch?: string;
  commit?: string;
  submodules?: GitSubmoduleRecord[];
};

export type DiscoveredRepository = {
  relativePath: string;
  kind: 'repository' | 'submodule';
  branch?: string;
  commit?: string;
};

export const shortCommit = (commit: string) => commit.slice(0, 7);

export const repositoryLabel = (repo: {
  kind: 'repository' | 'submodule';
  branch?: string;
  commit?: string;
}) => {
  const name =
    repo.branch ?? (repo.commit ? shortCommit(repo.commit) : 'detached');

  if (repo.kind === 'submodule') {
    return { message: 'submodule · {0}', args: [name] };
  }

  return { message: 'git · {0}', args: [name] };
};

export const discoverRepositories = (
  workspaceRoot: string,
  records: GitRepositoryRecord[],
  included: (relativeDirectory: string) => boolean
) => {
  const found: DiscoveredRepository[] = [];

  for (const record of records) {
    const relative = relativeToWorkspace(workspaceRoot, record.rootPath);

    if (relative === undefined) {
      continue;
    }

    if (relative !== '' && !included(relative)) {
      continue;
    }

    found.push({
      relativePath: relative,
      kind: 'repository',
      branch: record.branch,
      commit: record.commit
    });

    for (const submodule of record.submodules ?? []) {
      const submodulePath = joinPosix(relative, submodule.path);

      if (!included(submodulePath)) {
        continue;
      }

      found.push({
        relativePath: submodulePath,
        kind: 'submodule',
        branch: submodule.branch,
        commit: submodule.commit
      });
    }
  }

  return found;
};

export type GitApiRepository = {
  rootUri: { fsPath: string };
  state: {
    HEAD?: { name?: string; commit?: string };
    submodules?: Array<{ path: string }>;
    onDidChange: (listener: () => void) => { dispose: () => void };
  };
};

export type GitApiLike = {
  repositories: GitApiRepository[];
  onDidOpenRepository: (listener: (repository: GitApiRepository) => void) => {
    dispose: () => void;
  };
  onDidCloseRepository: (listener: (repository: GitApiRepository) => void) => {
    dispose: () => void;
  };
};

export const recordsFromGitApi = (api: GitApiLike): GitRepositoryRecord[] =>
  api.repositories.map(repository => ({
    rootPath: repository.rootUri.fsPath,
    branch: repository.state.HEAD?.name,
    commit: repository.state.HEAD?.commit,
    submodules: (repository.state.submodules ?? []).map(submodule => {
      const parent = repository.rootUri.fsPath
        .replace(/\\/g, '/')
        .replace(/\/$/, '');
      const opened = api.repositories.find(
        item =>
          item.rootUri.fsPath.replace(/\\/g, '/').replace(/\/$/, '') ===
          `${parent}/${submodule.path.replace(/\\/g, '/')}`
      );

      return {
        path: submodule.path,
        branch: opened?.state.HEAD?.name,
        commit: opened?.state.HEAD?.commit
      };
    })
  }));

export const gitUnavailableMessage = () =>
  'Git is not available in this window.';

export const noRepositoriesMessage = () =>
  'No Git repositories in this workspace.';

const relativeToWorkspace = (workspaceRoot: string, rootPath: string) => {
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const target = rootPath.replace(/\\/g, '/').replace(/\/$/, '');

  if (target === root) {
    return '';
  }

  if (!target.startsWith(`${root}/`)) {
    return undefined;
  }

  return target.slice(root.length + 1);
};

const joinPosix = (parent: string, child: string) => {
  const next = child.replace(/\\/g, '/').replace(/^\//, '');

  return parent ? `${parent}/${next}` : next;
};
