import type { FileTreeProvider } from './file-tree.provider';

import * as path from 'path';

import * as vscode from 'vscode';

import {
  changeBadge,
  changeStatusLabel
} from '../../domain/services/git-changes.service';

export const registerGitFileDecoration = (
  workspaceRoot: string,
  fileTreeProvider: FileTreeProvider
): vscode.Disposable =>
  vscode.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: fileTreeProvider.onDidChangeDecorations,
    provideFileDecoration: uri => {
      const relative = path
        .relative(workspaceRoot, uri.fsPath)
        .split(path.sep)
        .join('/');
      const change = fileTreeProvider
        .promptChangeList()
        .find(item => item.path === relative);

      if (!change) {
        return undefined;
      }

      const badge = changeBadge(change.status);
      const word = changeStatusLabel(change.status);

      return new vscode.FileDecoration(
        badge,
        vscode.l10n.t('{0} in the Git changes', word),
        new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
      );
    }
  });
