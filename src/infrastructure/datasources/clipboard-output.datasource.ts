import * as vscode from 'vscode';

import { PromptOutputDataSource } from '../../domain/datasources/prompt-output.datasource';

export class ClipboardOutputDataSource extends PromptOutputDataSource {
  write = async (text: string): Promise<void> => {
    await vscode.env.clipboard.writeText(text);
  };
}
