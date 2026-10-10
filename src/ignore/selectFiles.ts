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

export const filesSelectedByFolderAsync = async (
  workspaceRoot: string,
  folderPath: string,
  resolve: (relativePath: string, kind: 'file' | 'directory') => IgnoreDecision,
  options: {
    isCancelled?: () => boolean;
    yieldEvery?: number;
    omittedFolders?: string[];
  } = {}
) => {
  const selected: string[] = [];
  const omittedFolders = options.omittedFolders ?? [];
  const yieldEvery = options.yieldEvery ?? 64;
  let seen = 0;

  const visit = async (directory: string): Promise<boolean> => {
    if (options.isCancelled?.()) {
      return false;
    }

    const relativeDirectory = path.relative(workspaceRoot, directory);

    if (
      relativeDirectory !== '' &&
      !resolve(relativeDirectory, 'directory').included
    ) {
      omittedFolders.push(relativeDirectory.split(path.sep).join('/'));

      return true;
    }

    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      seen += 1;

      if (seen % yieldEvery === 0) {
        await new Promise(done => setImmediate(done));

        if (options.isCancelled?.()) {
          return false;
        }
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        const nested = await visit(fullPath);

        if (!nested) {
          return false;
        }

        continue;
      }

      if (resolve(relativePath, 'file').included) {
        selected.push(fullPath);
      }
    }

    return true;
  };

  const finished = await visit(folderPath);

  if (!finished) {
    return { files: [] as string[], cancelled: true };
  }

  return { files: selected.sort(), cancelled: false };
};

export const dedupeResolved = (paths: string[]) => [
  ...new Set(paths.map(filePath => path.resolve(filePath)))
];

export const omittedFoldersForSelection = (
  workspaceRoot: string,
  checkedDirectories: string[],
  resolve: (relativePath: string, kind: 'file' | 'directory') => IgnoreDecision
) => {
  const normalized = [
    ...new Set(checkedDirectories.map(directory => path.resolve(directory)))
  ];
  const roots = normalized.filter(
    directory =>
      !normalized.some(
        other =>
          other !== directory && directory.startsWith(`${other}${path.sep}`)
      )
  );
  const found = new Set<string>();

  for (const directory of roots) {
    const discovered: string[] = [];

    filesSelectedByFolder(workspaceRoot, directory, resolve, discovered);

    for (const folder of discovered) {
      found.add(folder);
    }
  }

  return [...found].sort();
};
