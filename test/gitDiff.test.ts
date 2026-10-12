import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_TREE,
  branchRangeBase,
  fillChangeDiff,
  listCommitChanges,
  pathsFromPatch,
  type DiffReader
} from '../src/gitDiff';

const reader = (): DiffReader & { calls: string[] } => {
  const calls: string[] = [];

  return {
    calls,
    diffWithHEAD: async filePath => {
      calls.push(`work:${filePath}`);

      return `diff work ${filePath}`;
    },
    diffWith: async (ref, filePath) => {
      calls.push(`with:${ref}:${filePath}`);

      return `diff ${ref} ${filePath}`;
    },
    diffIndexWithHEAD: async filePath => {
      calls.push(`index:${filePath}`);

      return `diff index ${filePath}`;
    },
    diffBetween: async (from, to, filePath) => {
      calls.push(`between:${from}:${to}:${filePath}`);

      return `diff ${from} ${to} ${filePath}`;
    },
    getMergeBase: async base => {
      calls.push(`base:${base}`);

      return 'mergebase';
    },
    parentOf: async hash => (hash === 'root' ? undefined : 'parent'),
    readFile: async () => 'hello\n'
  };
};

test('unquoted git paths are not split on spaces', () => {
  const patch = [
    'diff --git a/con espacio.txt b/con espacio.txt',
    '--- /dev/null',
    '+++ b/con espacio.txt',
    'diff --git a/docs/mi archivo.md b/docs/mi archivo.md',
    '--- /dev/null',
    '+++ b/docs/mi archivo.md',
    'diff --git a/a b/c.txt b/a b/c.txt',
    '--- /dev/null',
    '+++ b/a b/c.txt',
    'diff --git a/notes b/draft.md b/notes b/draft.md',
    '--- /dev/null',
    '+++ b/notes b/draft.md',
    'diff --git "a/espa\\303\\261ol.md" "b/espa\\303\\261ol.md"',
    '--- /dev/null',
    '+++ "b/espa\\303\\261ol.md"',
    'diff --git a/old.ts b/renamed.ts',
    '--- a/old.ts',
    '+++ "b/renamed con espacio.ts"'
  ].join('\n');

  assert.deepEqual(
    pathsFromPatch(patch).map(item => item.path),
    [
      'con espacio.txt',
      'docs/mi archivo.md',
      'a b/c.txt',
      'notes b/draft.md',
      'español.md',
      'renamed con espacio.ts'
    ]
  );
});

test('quoted git paths keep spaces, utf-8, and c escapes', () => {
  const patch = [
    'diff --git "a/espa\\303\\261ol.md" "b/espa\\303\\261ol.md"',
    'new file mode 100644',
    'diff --git "a/con espacio.txt" "b/con espacio.txt"',
    'new file mode 100644',
    'diff --git "a/tab\\tquote\\"slash\\\\x" "b/tab\\tquote\\"slash\\\\x"',
    'new file mode 100644',
    'diff --git a/normal.ts b/normal.ts',
    'new file mode 100644'
  ].join('\n');
  const paths = pathsFromPatch(patch).map(item => item.path);

  assert.deepEqual(paths, [
    'español.md',
    'con espacio.txt',
    'tab\tquote"slash\\x',
    'normal.ts'
  ]);
});

test('uncommitted diff keeps staged and unstaged hunks', async () => {
  const api = reader();

  api.diffWithHEAD = async filePath => {
    api.calls.push(`work:${filePath}`);

    return filePath === 'staged.ts' ? '' : 'unstaged only';
  };
  api.diffWith = async (ref, filePath) => {
    api.calls.push(`with:${ref}:${filePath}`);

    return filePath === 'staged.ts'
      ? 'staged hunk'
      : 'staged hunk\nunstaged hunk';
  };

  const stagedOnly = await fillChangeDiff(
    api,
    { path: 'staged.ts', status: 'modified' },
    'uncommitted'
  );
  const mixed = await fillChangeDiff(
    api,
    { path: 'mixed.ts', status: 'modified' },
    'uncommitted'
  );

  assert.match(stagedOnly.diff ?? '', /staged hunk/);
  assert.match(mixed.diff ?? '', /staged hunk/);
  assert.match(mixed.diff ?? '', /unstaged hunk/);
  assert.equal(api.calls.includes('work:staged.ts'), false);
  assert.equal(api.calls.includes('with:HEAD:mixed.ts'), true);
});

test('branch diff does not collapse to HEAD...HEAD', async () => {
  assert.equal(branchRangeBase(undefined, 'dev'), 'dev');
  assert.equal(branchRangeBase('HEAD', 'dev'), 'dev');
  assert.equal(branchRangeBase('abc', 'dev'), 'abc');

  const api = reader();
  const result = await fillChangeDiff(
    api,
    { path: 'a.ts', status: 'modified' },
    'branch',
    { base: branchRangeBase('HEAD', 'dev') }
  );

  assert.match(result.diff ?? '', /diff dev HEAD a.ts/);
  assert.equal(
    api.calls.some(call => call.startsWith('between:HEAD:HEAD')),
    false
  );
});

test('a root commit uses a two-dot diff, not three-dot against the empty tree', async () => {
  const calls: string[] = [];
  const listed = await listCommitChanges(
    {
      parentOf: async () => undefined,
      diffBetween: async (from, to) => {
        calls.push(`between:${from}:${to}`);

        return [{ path: 'missing.ts', status: 'modified' }];
      },
      diffBlobs: async (from, to) => {
        calls.push(`blobs:${from}:${to}`);

        return 'diff --git a/app.ts b/app.ts\nnew file mode 100644\n';
      }
    },
    'root'
  );
  const api = reader();

  api.show = async (ref, filePath) => {
    api.calls.push(`show:${ref}:${filePath}`);

    return 'hello\n';
  };
  const fileDiff = await fillChangeDiff(
    api,
    { path: 'app.ts', status: 'added' },
    'commit',
    { commit: 'root' }
  );

  assert.deepEqual(
    listed.map(item => item.path),
    ['app.ts']
  );
  assert.equal(
    calls.some(call => call.startsWith('between:')),
    false
  );
  assert.equal(calls.includes(`blobs:${EMPTY_TREE}:root`), true);
  assert.equal(
    api.calls.some(call => call.startsWith(`between:${EMPTY_TREE}`)),
    false
  );
  assert.match(fileDiff.diff ?? '', /new file mode/);
  assert.equal(api.calls.includes('show:root:app.ts'), true);
});

test('four scopes produce a non-empty diff', async () => {
  const api = reader();
  const staged = await fillChangeDiff(
    api,
    { path: 'a.ts', status: 'modified' },
    'staged'
  );
  const working = await fillChangeDiff(
    api,
    { path: 'b.ts', status: 'modified' },
    'uncommitted'
  );
  const untracked = await fillChangeDiff(
    api,
    { path: 'c.ts', status: 'untracked' },
    'uncommitted'
  );
  const commit = await fillChangeDiff(
    api,
    { path: 'd.ts', status: 'modified' },
    'commit',
    { commit: 'abc' }
  );
  const first = await fillChangeDiff(
    api,
    { path: 'e.ts', status: 'added' },
    'commit',
    { commit: 'root' }
  );
  const branch = await fillChangeDiff(
    api,
    { path: 'f.ts', status: 'modified' },
    'branch',
    { base: 'dev' }
  );
  const binary = await fillChangeDiff(
    api,
    { path: 'logo.png', status: 'modified', binary: true },
    'staged'
  );

  assert.match(staged.diff ?? '', /diff index a.ts/);
  assert.match(working.diff ?? '', /diff HEAD b.ts/);
  assert.match(untracked.diff ?? '', /new file mode/);
  assert.match(commit.diff ?? '', /diff parent abc d.ts/);
  assert.match(first.diff ?? '', /new file mode/);
  assert.equal(
    api.calls.some(call => call.startsWith(`between:${EMPTY_TREE}`)),
    false
  );
  assert.match(branch.diff ?? '', /diff dev HEAD f.ts/);
  assert.equal(binary.diff, undefined);
  assert.equal(binary.binary, true);
  assert.equal(api.calls.includes('index:logo.png'), false);
});
