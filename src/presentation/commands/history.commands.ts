import type { PromptChange } from '../../domain/entities/git-change.entity';
import type { StoredForcedRoot } from '../../domain/entities/selection-snapshot.entity';
import type { SelectionHistory } from '../../domain/services/selection-history.service';

import * as vscode from 'vscode';

export interface HistoryFileTreePort {
  setForcedRoots: (roots: StoredForcedRoot[]) => void;
  setCheckedFiles: (files: string[]) => Promise<void>;
}

export interface HistoryCommandDeps {
  history: SelectionHistory;
  saveHistory: () => Promise<void> | Thenable<void> | void;
  fileTreeProvider: HistoryFileTreePort;
  publishChanges: (changes: PromptChange[]) => void;
}

export const registerHistoryCommands = (
  deps: HistoryCommandDeps
): vscode.Disposable[] => [
  vscode.commands.registerCommand('promptfold.goBack', async () => {
    const previousSelection = deps.history.back();

    if (previousSelection) {
      await deps.saveHistory();
      deps.fileTreeProvider.setForcedRoots(previousSelection.forcedRoots);
      deps.publishChanges(previousSelection.promptChanges);
      await deps.fileTreeProvider.setCheckedFiles(previousSelection.files);
    } else {
      vscode.window.showWarningMessage(
        vscode.l10n.t('No previous selection to go back to.')
      );
    }
  }),
  vscode.commands.registerCommand('promptfold.goForward', async () => {
    const nextSelection = deps.history.forward();

    if (nextSelection) {
      await deps.saveHistory();
      deps.fileTreeProvider.setForcedRoots(nextSelection.forcedRoots);
      deps.publishChanges(nextSelection.promptChanges);
      await deps.fileTreeProvider.setCheckedFiles(nextSelection.files);
    } else {
      vscode.window.showWarningMessage(
        vscode.l10n.t('No next selection to go forward to.')
      );
    }
  })
];
