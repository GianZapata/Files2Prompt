import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupChangesByRepo,
  repoNodeLabel,
  syncChangeCheck,
  syncExtensionCheck
} from '../src/sideViews';

test('git changes group by repository and keep the branch', () => {
  const groups = groupChangesByRepo([
    {
      repo: 'launcher/api',
      path: 'src/a.ts',
      status: 'modified',
      scope: 'uncommitted',
      head: 'main'
    },
    {
      repo: 'launcher/api',
      path: 'src/b.ts',
      status: 'added',
      scope: 'uncommitted',
      head: 'main'
    },
    {
      repo: 'launcher/web',
      path: 'app.vue',
      status: 'deleted',
      scope: 'branch',
      base: 'dev',
      head: 'feature'
    }
  ]);

  assert.equal(groups.length, 2);
  assert.equal(repoNodeLabel('launcher/api', 'main'), 'launcher/api · main');
  assert.equal(groups[0].changes.length, 2);
  assert.deepEqual(
    groups[0].changes.map(change => change.path),
    ['src/a.ts', 'src/b.ts']
  );
  assert.equal(groups[1].base, 'dev');
  assert.equal(groups[1].head, 'feature');
});

test('checking a git change updates the prompt and the file selection', () => {
  const change = {
    repo: 'api',
    path: 'src/a.ts',
    status: 'modified' as const
  };
  const checked = syncChangeCheck({
    checked: true,
    change,
    selectedFiles: ['README.md'],
    promptChanges: []
  });
  const unchecked = syncChangeCheck({
    checked: false,
    change,
    selectedFiles: checked.files,
    promptChanges: checked.changes
  });

  assert.deepEqual(checked.files, ['README.md', 'src/a.ts']);
  assert.equal(checked.changes.length, 1);
  assert.deepEqual(unchecked.files, ['README.md']);
  assert.deepEqual(unchecked.changes, []);
});

test('checking an extension adds its files and unchecking removes only those', () => {
  const available = ['src/a.ts', 'src/b.ts', 'README.md'];
  const added = syncExtensionCheck({
    checked: true,
    suffix: '.ts',
    available,
    selected: ['README.md']
  });
  const removed = syncExtensionCheck({
    checked: false,
    suffix: '.ts',
    available,
    selected: added
  });

  assert.deepEqual(added, ['README.md', 'src/a.ts', 'src/b.ts']);
  assert.deepEqual(removed, ['README.md']);
});
