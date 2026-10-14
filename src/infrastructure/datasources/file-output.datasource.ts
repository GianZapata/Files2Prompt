import type { PromptPayload } from '../../domain/entities/prompt-payload.entity';

import * as vscode from 'vscode';

import { PromptOutputDataSource } from '../../domain/datasources/prompt-output.datasource';

export class FileOutputDataSource extends PromptOutputDataSource {
  constructor(private readonly targetUri: vscode.Uri) {
    super();
  }

  write = async (text: string, _payload?: PromptPayload): Promise<void> => {
    const encoded = Buffer.from(text, 'utf8');

    await vscode.workspace.fs.writeFile(this.targetUri, encoded);
  };
}
