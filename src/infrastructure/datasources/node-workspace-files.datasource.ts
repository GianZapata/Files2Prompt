import * as fs from 'fs';

import * as vscode from 'vscode';

import { WorkspaceFilesDataSource } from '../../domain/datasources/workspace-files.datasource';

export class NodeWorkspaceFilesDataSource extends WorkspaceFilesDataSource {
  existsAndIsFile = async (filePath: string): Promise<boolean> => {
    try {
      const stat = await fs.promises.lstat(filePath);

      return stat.isFile();
    } catch {
      return false;
    }
  };

  realPathOf = async (filePath: string): Promise<string | undefined> => {
    try {
      return await fs.promises.realpath(filePath);
    } catch {
      return undefined;
    }
  };

  sizeOf = async (filePath: string): Promise<number | undefined> => {
    try {
      const stat = await fs.promises.stat(filePath);

      return stat.size;
    } catch {
      return undefined;
    }
  };

  isBinary = async (filePath: string): Promise<boolean> => {
    try {
      const handle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buffer, 0, 8192, 0);

      await handle.close();

      return buffer.subarray(0, bytesRead).includes(0);
    } catch {
      return false;
    }
  };

  readText = async (filePath: string): Promise<string> => {
    const document = vscode.workspace.textDocuments.find(
      item => !item.isUntitled && item.uri.fsPath === filePath
    );

    if (document) {
      return document.getText();
    }

    return fs.promises.readFile(filePath, 'utf8');
  };
}
