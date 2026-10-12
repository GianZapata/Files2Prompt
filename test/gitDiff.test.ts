import assert from 'node:assert/strict';
import test from 'node:test';

import { EMPTY_TREE, fillChangeDiff, type DiffReader } from '../src/gitDiff';

const reader = (): DiffReader & { calls: string[] } => {
  const calls: string[] = [];

  return {
    calls,
    diffWithHEAD: async filePath => {
      calls.push(`work:${filePath}`);

      return `diff work ${filePath}`;
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
  assert.match(working.diff ?? '', /diff work b.ts/);
  assert.match(untracked.diff ?? '', /new file mode/);
  assert.match(commit.diff ?? '', /diff parent abc d.ts/);
  assert.match(first.diff ?? '', new RegExp(EMPTY_TREE));
  assert.match(branch.diff ?? '', /diff mergebase HEAD f.ts/);
  assert.equal(binary.diff, undefined);
  assert.equal(binary.binary, true);
  assert.equal(api.calls.includes('index:logo.png'), false);
});
