import * as vscode from 'vscode';

export interface SavePromptDialogOptions {
  defaultUri?: vscode.Uri;
  filters?: Record<string, string[]>;
  title?: string;
  saveLabel?: string;
}

export const promptSaveDestination = async (
  options: SavePromptDialogOptions = {}
): Promise<vscode.Uri | undefined> =>
  vscode.window.showSaveDialog({
    defaultUri: options.defaultUri,
    filters: options.filters,
    title: options.title,
    saveLabel: options.saveLabel
  });
