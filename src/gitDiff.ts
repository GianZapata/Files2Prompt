export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export const branchRangeBase = (
  mergeBase: string | undefined,
  baseName: string
) => (mergeBase && mergeBase !== 'HEAD' ? mergeBase : baseName);

export type DiffReader = {
  diffWithHEAD: (filePath: string) => Promise<string>;
  diffWith?: (ref: string, filePath: string) => Promise<string>;
  diffIndexWithHEAD: (filePath: string) => Promise<string>;
  diffBetween: (from: string, to: string, filePath: string) => Promise<string>;
  getMergeBase: (base: string, head: string) => Promise<string | undefined>;
  parentOf?: (hash: string) => Promise<string | undefined>;
  show?: (ref: string, filePath: string) => Promise<string>;
  readFile?: (filePath: string) => Promise<string>;
};

export type ListedCommitChange = {
  path: string;
  status: 'added' | 'modified' | 'deleted';
};

export const pathsFromPatch = (patch: string): ListedCommitChange[] =>
  [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(match => ({
    path: match[2],
    status: 'added' as const
  }));

export const listCommitChanges = async (
  reader: {
    parentOf: (hash: string) => Promise<string | undefined>;
    diffBetween: (
      from: string,
      to: string
    ) => Promise<ListedCommitChange[]>;
    diffBlobs: (from: string, to: string) => Promise<string>;
  },
  hash: string
) => {
  const parent = await reader.parentOf(hash);

  if (parent) {
    return reader.diffBetween(parent, hash);
  }

  return pathsFromPatch(await reader.diffBlobs(EMPTY_TREE, hash));
};

export type DiffRequest = {
  path: string;
  status: string;
  binary?: boolean;
};

export const fillChangeDiff = async (
  reader: DiffReader,
  change: DiffRequest,
  scope: 'uncommitted' | 'staged' | 'commit' | 'branch',
  refs: { commit?: string; base?: string } = {}
) => {
  if (change.binary) {
    return { binary: true as const };
  }

  if (scope === 'staged') {
    return { diff: await reader.diffIndexWithHEAD(change.path) };
  }

  if (scope === 'uncommitted') {
    if (change.status === 'untracked' || change.status === 'added') {
      const content = (await reader.readFile?.(change.path)) ?? '';

      return { diff: newFileDiff(change.path, content) };
    }

    return { diff: await reader.diffWith?.('HEAD', change.path) };
  }

  if (scope === 'commit') {
    const hash = refs.commit ?? 'HEAD';
    const parent = await reader.parentOf?.(hash);

    if (parent) {
      return { diff: await reader.diffBetween(parent, hash, change.path) };
    }

    const content = (await reader.show?.(hash, change.path)) ?? '';

    return { diff: newFileDiff(change.path, content) };
  }

  const from = refs.base && refs.base !== 'HEAD' ? refs.base : undefined;

  if (!from) {
    return { diff: '' };
  }

  return { diff: await reader.diffBetween(from, 'HEAD', change.path) };
};

const newFileDiff = (filePath: string, content: string) => {
  const lines = content.length === 0 ? [] : content.split('\n');
  const body = lines.map(line => `+${line}`).join('\n');

  return [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${Math.max(lines.length, 1)} @@`,
    body
  ]
    .filter(line => line.length > 0)
    .join('\n');
};
