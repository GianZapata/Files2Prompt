import assert from 'node:assert/strict';
import test from 'node:test';

import { createSelectionHistory } from '../src/selectionHistory';

test('clear then back restores the previous selection and forward returns empty', () => {
  const history = createSelectionHistory();

  history.record(['a.ts', 'b.ts']);
  history.record(['a.ts', 'b.ts']);
  history.record([]);

  assert.deepEqual(history.back(), {
    files: ['a.ts', 'b.ts'],
    forcedRoots: [],
    promptChanges: []
  });
  assert.equal(history.canForward(), true);
  assert.deepEqual(history.forward(), {
    files: [],
    forcedRoots: [],
    promptChanges: []
  });
});

test('history restores git changes with the selection', () => {
  const history = createSelectionHistory();

  history.record({
    files: [],
    forcedRoots: [],
    promptChanges: [{ repo: 'api', path: 'api/a.ts', status: 'modified' }]
  });
  history.record({ files: [], forcedRoots: [], promptChanges: [] });

  assert.equal(history.back()?.promptChanges?.[0]?.path, 'api/a.ts');
});

test('history restores forced roots with the selection', () => {
  const history = createSelectionHistory();

  history.record({
    files: ['odd/keep.ts'],
    forcedRoots: [
      { relativePath: 'odd', pattern: 'odd/', sourceFile: '.gitignore' }
    ],
    promptChanges: []
  });
  history.record({ files: [], forcedRoots: [], promptChanges: [] });

  assert.equal(history.back()?.forcedRoots[0]?.relativePath, 'odd');
});
