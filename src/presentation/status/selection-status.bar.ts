import type { FileTreeProvider } from '../views/file-tree.provider';

import * as vscode from 'vscode';

import {
  formatByteSize,
  nextOutputFormat,
  outputFormatLabel,
  selectionStatus,
  shouldRefreshSummary
} from '../../domain/services/selection-budget.service';

export interface SelectionStatusBarOptions {
  fileTreeProvider: FileTreeProvider;
  treeView: vscode.TreeView<unknown>;
}

export interface SelectionStatusBarHandle {
  disposables: vscode.Disposable[];
  scheduleDescription: () => void;
}

export const createSelectionStatusBar = (
  options: SelectionStatusBarOptions
): SelectionStatusBarHandle => {
  const selectionItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );

  selectionItem.command = 'files2prompt.changeOutputFormat';
  selectionItem.name = vscode.l10n.t('Files2Prompt selection');

  let descriptionTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleDescription = () => {
    if (descriptionTimer) {
      clearTimeout(descriptionTimer);
    }

    descriptionTimer = setTimeout(() => {
      void options.fileTreeProvider.selectionStats().then(stats => {
        const byteLabel = formatByteSize(stats.bytes);
        const changes = options.fileTreeProvider.promptChangeList();
        const status = selectionStatus({
          fileCount: stats.count,
          byteLabel,
          changeCount: changes.length,
          repositoryCount: new Set(changes.map(change => change.repo)).size,
          format: vscode.workspace
            .getConfiguration('files2prompt')
            .get<string>('outputFormat', 'xml')
        });

        options.treeView.description = vscode.l10n.t(
          '{0} files · {1}',
          stats.count,
          byteLabel
        );
        selectionItem.text = status.text;
        selectionItem.tooltip = status.tooltip;
        selectionItem.accessibilityInformation = {
          label: status.accessibility,
          role: 'button'
        };
        selectionItem.show();
      });
    }, 200);
  };

  const changeFormatCommand = vscode.commands.registerCommand(
    'files2prompt.changeOutputFormat',
    async () => {
      const current = vscode.workspace
        .getConfiguration('files2prompt')
        .get<string>('outputFormat', 'xml');
      const picked = await vscode.window.showQuickPick(
        (['xml', 'markdown', 'plain'] as const).map(format => ({
          label: vscode.l10n.t(outputFormatLabel(format)),
          description:
            format === current ? vscode.l10n.t('Current') : undefined,
          format
        })),
        {
          placeHolder: vscode.l10n.t('Choose the output format')
        }
      );
      const next = nextOutputFormat(current, picked?.format);

      if (!next.changed || next.wroteClipboard) {
        return;
      }

      await vscode.workspace
        .getConfiguration('files2prompt')
        .update(
          'outputFormat',
          next.format,
          vscode.ConfigurationTarget.Workspace
        );
      scheduleDescription();
    }
  );

  const configListener = vscode.workspace.onDidChangeConfiguration(event => {
    const section = 'files2prompt.outputFormat';

    if (event.affectsConfiguration(section) && shouldRefreshSummary(section)) {
      scheduleDescription();
    }
  });

  return {
    disposables: [selectionItem, changeFormatCommand, configListener],
    scheduleDescription
  };
};
