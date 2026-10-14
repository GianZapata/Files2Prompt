import type { SelectionSnapshot } from '../../domain/entities/selection-snapshot.entity';
import type { RecordSelectionUseCase } from '../../domain/use-cases/selection/record-selection.use-case';
import type { ExclusionDecision } from '../pickers/exclusion.prompt';
import type {
  ExtensionRowItem,
  ExtensionsProvider
} from '../views/extensions.provider';
import type { FileItem, FileTreeProvider } from '../views/file-tree.provider';
import type {
  GitChangeItem,
  GitChangesProvider
} from '../views/git-changes.tree-provider';

import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import {
  extensionCounts,
  extensionPickItems,
  filterByExtensions
} from '../../domain/services/extension-filter.service';
import {
  syncChangeCheck,
  syncExtensionCheck
} from '../../domain/services/side-views.service';
import { filesSelectedByFolderAsync } from '../../infrastructure/filesystem/select-files.walker';

export interface SelectionTargetPort {
  resourceUri?: vscode.Uri;
}

export interface ExtensionChoiceItem extends vscode.QuickPickItem {
  suffixes: string[];
}

export interface SelectionCommandDeps {
  workspaceRoot: string;
  fileTreeProvider: FileTreeProvider;
  treeView: vscode.TreeView<FileItem>;
  gitChanges: GitChangesProvider;
  gitChangesView: vscode.TreeView<GitChangeItem>;
  extensions: ExtensionsProvider;
  extensionsView: vscode.TreeView<ExtensionRowItem>;
  recordSelection: RecordSelectionUseCase;
  currentSnapshot: () => SelectionSnapshot;
  confirmExcluded: (
    provider: FileTreeProvider,
    folderPath: string,
    relativePath: string,
    decision: ExclusionDecision
  ) => Promise<boolean>;
  refreshExtensions: () => void;
}

export const folderFromTarget = (
  target: vscode.Uri | SelectionTargetPort | undefined,
  workspaceRoot: string
) => {
  if (target instanceof vscode.Uri) {
    return fs.existsSync(target.fsPath) &&
      fs.lstatSync(target.fsPath).isDirectory()
      ? target.fsPath
      : path.dirname(target.fsPath);
  }

  if (target?.resourceUri) {
    return target.resourceUri.fsPath;
  }

  return workspaceRoot;
};

export const registerSelectionCommands = (
  deps: SelectionCommandDeps
): vscode.Disposable[] => [
  vscode.commands.registerCommand('promptfold.clearChecks', async () => {
    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
    deps.fileTreeProvider.clearChecks();
    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
    void vscode.window.showInformationMessage(
      vscode.l10n.t('All checks have been cleared.')
    );
  }),
  vscode.commands.registerCommand('promptfold.selectAll', async () => {
    const outcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Selecting files'),
        cancellable: true
      },
      async (_progress, token) =>
        deps.fileTreeProvider.selectFolder(deps.workspaceRoot, {
          isCancelled: () => token.isCancellationRequested
        })
    );

    if (outcome === 'cancelled') {
      return;
    }

    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
  }),
  vscode.commands.registerCommand(
    'promptfold.selectByExtension',
    async (target?: vscode.Uri | SelectionTargetPort) => {
      const folderPath = folderFromTarget(target, deps.workspaceRoot);
      const listed = await filesSelectedByFolderAsync(
        deps.workspaceRoot,
        folderPath,
        deps.fileTreeProvider.resolvePath.bind(deps.fileTreeProvider)
      );

      const relative = listed.files.map(filePath =>
        path.relative(deps.workspaceRoot, filePath).split(path.sep).join('/')
      );

      const presets = vscode.workspace
        .getConfiguration('promptfold')
        .get<Record<string, string[]>>('extensionPresets', {});

      const detected: ExtensionChoiceItem[] = [
        ...Object.entries(presets).map(([name, suffixes]) => ({
          label: name,
          description: suffixes.join(', '),
          suffixes
        })),
        ...extensionCounts(relative).map(([suffix, count]) => ({
          label: `${suffix} (${count})`,
          description: String(count),
          suffixes: [suffix === '(no extension)' ? '' : suffix]
        }))
      ];

      const picked = await new Promise<ExtensionChoiceItem[] | undefined>(
        resolve => {
          const pick = vscode.window.createQuickPick<ExtensionChoiceItem>();
          let settled = false;

          const finish = (value: ExtensionChoiceItem[] | undefined) => {
            if (settled) {
              return;
            }

            settled = true;
            pick.dispose();
            resolve(value);
          };

          pick.canSelectMany = true;
          pick.placeholder = vscode.l10n.t(
            'Select several or type md, ts, php'
          );

          pick.items = detected;

          pick.onDidChangeValue(value => {
            pick.items = extensionPickItems(detected, value);
          });

          pick.onDidAccept(() => {
            finish([...pick.selectedItems]);
          });

          pick.onDidHide(() => {
            finish(undefined);
          });

          pick.show();
        }
      );

      if (!picked || picked.length === 0) {
        return;
      }

      const suffixes = picked.flatMap(item => item.suffixes);

      if (suffixes.length === 0) {
        return;
      }

      const mode = await vscode.window.showQuickPick(
        [
          {
            label: vscode.l10n.t('Add to selection'),
            id: 'add'
          },
          {
            label: vscode.l10n.t('Replace selection'),
            id: 'replace'
          }
        ],
        { placeHolder: vscode.l10n.t('How should this selection apply?') }
      );

      if (!mode) {
        return;
      }

      const matched = filterByExtensions(relative, suffixes).map(file =>
        path.join(deps.workspaceRoot, file)
      );

      if (mode.id === 'replace') {
        deps.fileTreeProvider.clearChecks();
      }

      await deps.fileTreeProvider.setCheckedFiles(
        [
          ...(mode.id === 'add' ? deps.fileTreeProvider.getCheckedFiles() : []),
          ...matched
        ],
        { bulk: true }
      );

      await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
    }
  ),
  deps.treeView.onDidChangeCheckboxState(async event => {
    for (const [item, state] of event.items) {
      const relative = path
        .relative(deps.workspaceRoot, item.resourceUri.fsPath)
        .split(path.sep)
        .join('/');

      const kind = item.isDirectory ? 'directory' : 'file';

      if (state === vscode.TreeItemCheckboxState.Unchecked) {
        deps.fileTreeProvider.removeForcedRoot(relative);
        await deps.fileTreeProvider.updateCheckState(item, state);
        continue;
      }

      const decision = deps.fileTreeProvider.explain(relative, kind);

      if (!decision.included) {
        const forced = await deps.confirmExcluded(
          deps.fileTreeProvider,
          item.resourceUri.fsPath,
          relative,
          decision
        );

        if (!forced) {
          await deps.fileTreeProvider.updateCheckState(
            item,
            vscode.TreeItemCheckboxState.Unchecked
          );

          continue;
        }
      }

      if (item.isDirectory) {
        const outcome = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Selecting files'),
            cancellable: true
          },
          async (_progress, token) =>
            deps.fileTreeProvider.selectFolder(item.resourceUri.fsPath, {
              isCancelled: () => token.isCancellationRequested
            })
        );

        if (outcome === 'cancelled') {
          await deps.fileTreeProvider.updateCheckState(
            item,
            vscode.TreeItemCheckboxState.Unchecked
          );
        }
      } else {
        await deps.fileTreeProvider.updateCheckState(item, state);
      }
    }

    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
  }),
  deps.gitChangesView.onDidChangeCheckboxState(async event => {
    for (const [item, state] of event.items) {
      if (!item.change) {
        continue;
      }

      const selected = deps.fileTreeProvider
        .getCheckedFiles()
        .map(filePath =>
          path.relative(deps.workspaceRoot, filePath).split(path.sep).join('/')
        );

      const next = syncChangeCheck({
        checked: state === vscode.TreeItemCheckboxState.Checked,
        change: item.change,
        selectedFiles: selected,
        promptChanges: deps.fileTreeProvider.promptChangeList()
      });

      deps.fileTreeProvider.setPromptChanges(next.changes);
      deps.gitChanges.setIncluded(next.changes);
      await deps.fileTreeProvider.setCheckedFiles(
        next.files.map(filePath => path.join(deps.workspaceRoot, filePath))
      );
    }

    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
  }),
  deps.extensionsView.onDidChangeCheckboxState(async event => {
    const available = deps.extensions.availableFiles();
    let selected = deps.fileTreeProvider
      .getCheckedFiles()
      .map(filePath =>
        path.relative(deps.workspaceRoot, filePath).split(path.sep).join('/')
      );

    for (const [item, state] of event.items) {
      selected = syncExtensionCheck({
        checked: state === vscode.TreeItemCheckboxState.Checked,
        suffix: item.suffix,
        available,
        selected
      });
    }

    await deps.fileTreeProvider.setCheckedFiles(
      selected.map(filePath => path.join(deps.workspaceRoot, filePath)),
      { bulk: true }
    );

    deps.extensions.setFiles(available, selected);
    await deps.recordSelection.execute({ snapshot: deps.currentSnapshot() });
  }),
  deps.fileTreeProvider.onDidChangeTreeData(() => {
    deps.refreshExtensions();
  })
];
