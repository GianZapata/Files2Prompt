import * as vscode from 'vscode';

const EXTENSION_ID = 'gianzapata.promptfold';
const GIT_EXTENSION_ID = 'vscode.git';
const GIT_READY_TIMEOUT_MS = 30000;
const GIT_POLL_MS = 200;

interface GitRepositoryState {
  workingTreeChanges: readonly unknown[];
  untrackedChanges?: readonly unknown[];
}

interface GitRepositoryLike {
  state: GitRepositoryState;
}

interface GitApiLike {
  repositories: readonly GitRepositoryLike[];
}

interface GitExtensionExports {
  getAPI: (version: 1) => GitApiLike;
}

export const delay = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

export const workspaceRoot = () => {
  const folder = vscode.workspace.workspaceFolders?.[0];

  if (!folder) {
    throw new Error('The integration workspace is not open');
  }

  return folder.uri.fsPath;
};

export const activateExtension = async () => {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);

  if (!extension) {
    throw new Error(`${EXTENSION_ID} is not installed in the test host`);
  }

  await extension.activate();
};

const hasChanges = (repository: GitRepositoryLike) =>
  repository.state.workingTreeChanges.length +
    (repository.state.untrackedChanges?.length ?? 0) >
  0;

export const waitForRepositories = async (count: number) => {
  const git =
    vscode.extensions.getExtension<GitExtensionExports>(GIT_EXTENSION_ID);

  if (!git) {
    throw new Error('The built-in Git extension is not available');
  }

  const api = (await git.activate()).getAPI(1);
  const deadline = Date.now() + GIT_READY_TIMEOUT_MS;

  while (
    api.repositories.length < count ||
    !api.repositories.every(hasChanges)
  ) {
    if (Date.now() > deadline) {
      throw new Error(
        `Git opened ${api.repositories.length} of ${count} repositories in time`
      );
    }

    await delay(GIT_POLL_MS);
  }
};
