import type {
  SelectionSnapshot,
  StoredForcedRoot,
  StoredPromptChange
} from '../entities/selection-snapshot.entity';

export type { SelectionSnapshot, StoredForcedRoot, StoredPromptChange };

export interface SelectionHistory {
  record: (snapshot: string[] | SelectionSnapshot) => void;
  back: () => SelectionSnapshot | undefined;
  forward: () => SelectionSnapshot | undefined;
  canBack: () => boolean;
  canForward: () => boolean;
  entries: () => SelectionSnapshot[];
  position: () => number;
}

const asSnapshot = (value: string[] | SelectionSnapshot): SelectionSnapshot =>
  Array.isArray(value)
    ? { files: [...value], forcedRoots: [], promptChanges: [] }
    : {
        files: [...value.files],
        forcedRoots: [...value.forcedRoots],
        promptChanges: [...(value.promptChanges ?? [])]
      };

const sameSnapshot = (left: SelectionSnapshot, right: SelectionSnapshot) => {
  const files =
    [...left.files].sort().join('\0') === [...right.files].sort().join('\0');

  const roots =
    [...left.forcedRoots.map(root => root.relativePath)].sort().join('\0') ===
    [...right.forcedRoots.map(root => root.relativePath)].sort().join('\0');

  const changes =
    [...left.promptChanges.map(change => `${change.repo}:${change.path}`)]
      .sort()
      .join('\0') ===
    [...right.promptChanges.map(change => `${change.repo}:${change.path}`)]
      .sort()
      .join('\0');

  return files && roots && changes;
};

export const createSelectionHistory = (
  initial: Array<string[] | SelectionSnapshot> = [],
  start = initial.length - 1
): SelectionHistory => {
  let entries = initial.slice(-20).map(asSnapshot);
  let index = entries.length === 0 ? -1 : Math.min(start, entries.length - 1);

  const trim = () => {
    if (entries.length > 20) {
      const extra = entries.length - 20;

      entries = entries.slice(extra);
      index -= extra;
    }
  };

  return {
    record: (snapshot: string[] | SelectionSnapshot) => {
      const next = asSnapshot(snapshot);
      const current = entries[index];

      if (current && sameSnapshot(current, next)) {
        return;
      }

      entries = entries.slice(0, index + 1);
      entries.push(next);
      index = entries.length - 1;
      trim();
    },
    back: () => {
      if (index <= 0) {
        return undefined;
      }

      index -= 1;

      return asSnapshot(entries[index]);
    },
    forward: () => {
      if (index < 0 || index >= entries.length - 1) {
        return undefined;
      }

      index += 1;

      return asSnapshot(entries[index]);
    },
    canBack: () => index > 0,
    canForward: () => index >= 0 && index < entries.length - 1,
    entries: () => entries.map(asSnapshot),
    position: () => index
  };
};
