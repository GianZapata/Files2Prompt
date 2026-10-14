import type { DiscoveredRepository, GitApiLike } from '../../gitRepos';
import type { FileTreeProvider } from '../views/file-tree.provider';

import * as vscode from 'vscode';

import {
  discoverRepositories,
  gitUnavailableMessage,
  noRepositoriesMessage,
  recordsFromGitApi
} from '../../domain/services/git-repos.service';

export const watchGitRepositories = (
  workspaceRoot: string,
  provider: FileTreeProvider,
  onRepositories?: (found: DiscoveredRepository[]) => void
): vscode.Disposable => {
  const disposable = new vscode.Disposable(() => undefined);
  const gitExtension = vscode.extensions.getExtension('vscode.git');

  if (!gitExtension) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t(gitUnavailableMessage())
    );

    return disposable;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let reportedEmpty = false;
  const subscriptions: vscode.Disposable[] = [];

  const refresh = (api: GitApiLike) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      const found = discoverRepositories(
        workspaceRoot,
        recordsFromGitApi(api),
        relative =>
          relative === '' ||
          provider.explain(relative, 'directory').included ||
          provider.forcedRootFor(relative) !== undefined
      );

      provider.setRepositories(found);
      onRepositories?.(found);

      if (found.length === 0 && !reportedEmpty) {
        reportedEmpty = true;
        void vscode.window.showInformationMessage(
          vscode.l10n.t(noRepositoriesMessage())
        );
      }
    }, 200);
  };

  void gitExtension.activate().then(exports => {
    const api = (exports as { getAPI: (version: 1) => GitApiLike }).getAPI(1);

    refresh(api);
    subscriptions.push(
      api.onDidOpenRepository(() => refresh(api)),
      api.onDidCloseRepository(() => refresh(api))
    );

    for (const repository of api.repositories) {
      subscriptions.push(repository.state.onDidChange(() => refresh(api)));
    }
  });

  return new vscode.Disposable(() => {
    if (timer) {
      clearTimeout(timer);
    }

    for (const item of subscriptions) {
      item.dispose();
    }
  });
};
