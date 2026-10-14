import type {
  DiscoveredRepository,
  PromptChange
} from '../../domain/entities/git-change.entity';
import type { GitChangesRepository } from '../../domain/repositories/git-changes.repository';
import type { DiscoverGitRepositoriesUseCase } from '../../domain/use-cases/git/discover-git-repositories.use-case';
import type { GetGitChangesUseCase } from '../../domain/use-cases/git/get-git-changes.use-case';
import type { GitChangeItem } from '../views/git-changes.tree-provider';

import * as path from 'path';

import * as vscode from 'vscode';

import {
  GitScope,
  type AnyGitScope
} from '../../domain/entities/git-scope.enum';
import {
  applyChangeSelection,
  gitScopeMenu,
  mergeChanges
} from '../../domain/services/git-changes.service';
import {
  gitUnavailableMessage,
  noRepositoriesMessage
} from '../../domain/services/git-repos.service';

export interface GitFileSelectionPort {
  getCheckedFiles: () => string[];
  setCheckedFiles: (files: string[]) => Promise<void>;
  clearChecks: () => void;
  promptChangeList: () => PromptChange[];
}

export interface GitCommandDeps {
  workspaceRoot: string;
  gitRepository: GitChangesRepository;
  getGitChanges: GetGitChangesUseCase;
  discoverRepositories: DiscoverGitRepositoriesUseCase;
  fileSelection: GitFileSelectionPort;
  publishChanges: (changes: PromptChange[]) => void;
  recordHistory: () => void;
  saveHistory: () => Thenable<void> | void;
  scheduleDescription: () => void;
}

export const gitScopeItems = () =>
  gitScopeMenu().map(item =>
    item.kind === 'separator'
      ? {
          label: vscode.l10n.t(item.labelKey),
          kind: vscode.QuickPickItemKind.Separator
        }
      : {
          label: vscode.l10n.t(item.labelKey),
          scope: item.scope
        }
  );

export const registerGitCommands = (
  deps: GitCommandDeps
): vscode.Disposable[] => {
  const reloadRepo = async (
    repo: string,
    scope: AnyGitScope,
    forcedBase?: string
  ) => {
    const collected = await deps.getGitChanges.execute({
      repoRelative: repo,
      scope,
      forcedBase
    });

    const others = deps.fileSelection
      .promptChangeList()
      .filter(change => change.repo !== repo);

    deps.publishChanges([...others, ...collected]);

    const updatedFiles = [
      ...deps.fileSelection.getCheckedFiles(),
      ...collected
        .filter(change => change.status !== 'deleted')
        .map(change => path.join(deps.workspaceRoot, change.path))
    ].filter((filePath, index, all) => all.indexOf(filePath) === index);

    await deps.fileSelection.setCheckedFiles(updatedFiles);
  };

  return [
    vscode.commands.registerCommand('files2prompt.clearGitChanges', () => {
      deps.publishChanges([]);
      deps.scheduleDescription();
    }),

    vscode.commands.registerCommand(
      'files2prompt.gitChanges.setScope',
      async (item?: GitChangeItem) => {
        if (!item) {
          return;
        }

        const picked = await vscode.window.showQuickPick(gitScopeItems(), {
          placeHolder: vscode.l10n.t('Which changes should be selected?')
        });

        if (!picked || !('scope' in picked) || !picked.scope) {
          return;
        }

        await reloadRepo(item.repo, picked.scope);
      }
    ),

    vscode.commands.registerCommand(
      'files2prompt.gitChanges.setBase',
      async (item?: GitChangeItem) => {
        if (!item) {
          return;
        }

        const baseName = await vscode.window.showInputBox({
          prompt: vscode.l10n.t('Base branch or commit')
        });

        if (!baseName) {
          return;
        }

        await reloadRepo(item.repo, GitScope.Branch, baseName);
      }
    ),

    vscode.commands.registerCommand(
      'files2prompt.selectChanges',
      async (target?: { resourceUri?: vscode.Uri }) => {
        if (!(await deps.gitRepository.isAvailable())) {
          await vscode.window.showInformationMessage(
            vscode.l10n.t(gitUnavailableMessage())
          );

          return;
        }

        const wanted = target?.resourceUri
          ? path
              .relative(deps.workspaceRoot, target.resourceUri.fsPath)
              .split(path.sep)
              .join('/')
          : undefined;

        const repos = await deps.discoverRepositories.execute(wanted);

        if (repos.length === 0) {
          await vscode.window.showInformationMessage(
            vscode.l10n.t(noRepositoriesMessage())
          );

          return;
        }

        let selectedRepos: DiscoveredRepository[] = [];

        if (repos.length === 1) {
          selectedRepos = repos;
        } else {
          const picked = await vscode.window.showQuickPick(
            repos.map(r => ({
              label: r.relativePath || path.basename(deps.workspaceRoot),
              description: r.branch,
              repo: r
            })),
            {
              canPickMany: true,
              placeHolder: vscode.l10n.t('Choose repositories')
            }
          );

          if (!picked || picked.length === 0) {
            return;
          }

          selectedRepos = picked.map(item => item.repo);
        }

        const scopePick = await vscode.window.showQuickPick(gitScopeItems(), {
          placeHolder: vscode.l10n.t('Which changes should be selected?')
        });

        const scope =
          scopePick && 'scope' in scopePick ? scopePick.scope : undefined;

        if (!scope) {
          return;
        }

        const modePick = await vscode.window.showQuickPick(
          [
            { label: vscode.l10n.t('Add to selection'), id: 'add' as const },
            {
              label: vscode.l10n.t('Replace selection'),
              id: 'replace' as const
            }
          ],
          { placeHolder: vscode.l10n.t('How should this selection apply?') }
        );

        if (!modePick) {
          return;
        }

        const changes: PromptChange[] = [];

        for (const repo of selectedRepos) {
          const collected = await deps.getGitChanges.execute({
            repoRelative: repo.relativePath,
            scope
          });

          changes.push(...collected);
        }

        if (changes.some(change => change.status === 'submodule')) {
          const includeInner = vscode.l10n.t('Include');
          const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Include the submodule diff?'),
            { modal: true },
            includeInner,
            vscode.l10n.t('Cancel')
          );

          if (choice !== includeInner) {
            for (const change of changes) {
              if (change.status === 'submodule') {
                change.diff = undefined;
              }
            }
          }
        }

        const current = deps.fileSelection
          .getCheckedFiles()
          .map(filePath =>
            path
              .relative(deps.workspaceRoot, filePath)
              .split(path.sep)
              .join('/')
          );

        const next = applyChangeSelection(current, changes, modePick.id);

        if (modePick.id === 'replace') {
          deps.fileSelection.clearChecks();
        }

        await deps.fileSelection.setCheckedFiles(
          next.map(filePath => path.join(deps.workspaceRoot, filePath))
        );

        deps.publishChanges(
          modePick.id === 'add'
            ? mergeChanges(deps.fileSelection.promptChangeList(), changes)
            : changes
        );

        deps.recordHistory();
        await deps.saveHistory();
        deps.scheduleDescription();
      }
    )
  ];
};
