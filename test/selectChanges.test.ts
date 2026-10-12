import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChangeSelection,
  changeBadge,
  changesNodeLabel,
  changesForScope,
  mergeChanges,
  pathsToCheck
} from '../src/selectChanges';

test('adding changes merges by repository and path', () => {
  const merged = mergeChanges(
    [
      {
        repo: 'api',
        path: 'api/a.ts',
        status: 'modified',
        diff: 'old'
      }
    ],
    [
      {
        repo: 'api',
        path: 'api/a.ts',
        status: 'modified',
        diff: 'new'
      },
      { repo: 'web', path: 'web/b.ts', status: 'added', diff: 'add' }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.find(change => change.path === 'api/a.ts')?.diff, 'new');
});

test('git changes node names the count and badges each status', () => {
  assert.equal(changesNodeLabel(4, 2), 'Git changes · 4 (2 repositories)');
  assert.equal(changeBadge('modified'), 'M');
  assert.equal(changeBadge('added'), 'A');
  assert.equal(changeBadge('deleted'), 'D');
  assert.equal(changeBadge('renamed'), 'R');
});

test('uncommitted changes keep deletions for the diff and check only live files', () => {
  const changes = changesForScope(
    {
      repo: 'elcaba-api',
      staged: [
        { path: 'app/Foo.php', status: 'modified', diff: 'diff --git a/Foo' }
      ],
      working: [
        { path: 'app/Old.php', status: 'deleted', diff: 'diff --git a/Old' }
      ],
      untracked: [{ path: 'app/New.php', status: 'untracked' }],
      commit: [],
      branch: []
    },
    'uncommitted'
  );

  assert.deepEqual(pathsToCheck(changes), [
    'elcaba-api/app/Foo.php',
    'elcaba-api/app/New.php'
  ]);
  assert.equal(
    changes.find(change => change.status === 'deleted')?.path,
    'elcaba-api/app/Old.php'
  );
  assert.deepEqual(
    applyChangeSelection(['elcaba-api/README.md'], changes, 'add'),
    ['elcaba-api/README.md', 'elcaba-api/app/Foo.php', 'elcaba-api/app/New.php']
  );
});
