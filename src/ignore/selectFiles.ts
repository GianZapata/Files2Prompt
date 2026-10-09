import type { IgnoreDecision } from './ignoreReason';

import fs from 'fs';
import path from 'path';

export const filesSelectedByFolder = (
  workspaceRoot: string,
  folderPath: string,
  resolve: (relativePath: string, kind: 'file' | 'directory') => IgnoreDecision,
  omittedFolders: string[] = []
) => {
  const selected: string[] = [];
  const visit = (directory: string) => {
    const relativeDirectory = path.relative(workspaceRoot, directory);

    if (
      relativeDirectory !== '' &&
      !resolve(relativeDirectory, 'directory').included
    ) {
      omittedFolders.push(relativeDirectory.split(path.sep).join('/'));

      return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        visit(fullPath);

        continue;
      }

      if (resolve(relativePath, 'file').included) {
        selected.push(fullPath);
      }
    }
  };

  visit(folderPath);

  return selected.sort();
};
