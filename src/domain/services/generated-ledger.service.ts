import * as path from 'path';

import { isSameOrInside } from '../helpers/path-containment';
import { toPosixRelative } from '../helpers/to-posix-relative';

export interface LedgerView {
  isChecked: (filePath: string) => boolean;
  isFolderChecked: (folderPath: string) => boolean;
  isStillGenerated: (relativePath: string) => boolean;
}

export interface GeneratedLedger {
  recordListed: (filePaths: string[]) => void;
  recordFromFolder: (filePaths: string[]) => void;
  forgetInside: (folderPath: string) => void;
  clearListed: () => void;
  clear: () => void;
  skipped: (view: LedgerView) => string[];
}

export const createGeneratedLedger = (
  workspaceRoot: string
): GeneratedLedger => {
  const listed = new Set<string>();
  const fromFolders = new Set<string>();

  const hasCheckedAncestor = (filePath: string, view: LedgerView) => {
    let directory = path.dirname(filePath);

    while (isSameOrInside(workspaceRoot, directory)) {
      if (view.isFolderChecked(directory)) {
        return true;
      }

      const parent = path.dirname(directory);

      if (parent === directory) {
        break;
      }

      directory = parent;
    }

    return false;
  };

  return {
    recordListed: filePaths => {
      for (const filePath of filePaths) {
        listed.add(filePath);
      }
    },
    recordFromFolder: filePaths => {
      for (const filePath of filePaths) {
        fromFolders.add(filePath);
      }
    },
    forgetInside: folderPath => {
      for (const filePath of fromFolders) {
        if (isSameOrInside(folderPath, filePath)) {
          fromFolders.delete(filePath);
        }
      }
    },
    clearListed: () => listed.clear(),
    clear: () => {
      listed.clear();
      fromFolders.clear();
    },
    skipped: view => {
      const relatives = [...listed, ...fromFolders]
        .filter(filePath => !view.isChecked(filePath))
        .filter(
          filePath => listed.has(filePath) || hasCheckedAncestor(filePath, view)
        )
        .map(filePath => toPosixRelative(workspaceRoot, filePath))
        .filter(view.isStillGenerated);

      return [...new Set(relatives)].sort();
    }
  };
};
