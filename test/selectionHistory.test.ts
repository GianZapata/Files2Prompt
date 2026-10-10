import assert from 'node:assert/strict';
import test from 'node:test';

import { createSelectionHistory } from '../src/selectionHistory';

test('clear then back restores the previous selection and forward returns empty', () => {
  const history = createSelectionHistory();

  history.record(['a.ts', 'b.ts']);
  history.record(['a.ts', 'b.ts']);
  history.record([]);

  assert.deepEqual(history.back(), ['a.ts', 'b.ts']);
  assert.equal(history.canForward(), true);
  assert.deepEqual(history.forward(), []);
});
