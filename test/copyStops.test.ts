import assert from 'node:assert/strict';
import test from 'node:test';

import { takeUntilStop } from '../src/domain/services/copy-stops.service';

test('cancel during copy does not keep later files', async () => {
  let seen = 0;
  const result = await takeUntilStop(['a', 'b', 'c'], {
    isCancelled: () => seen++ > 0,
    maxFiles: 5000,
    maxTotalBytes: 100,
    byteLength: accepted => accepted.join('').length
  });

  assert.equal(result.stop, 'user-cancelled');
  assert.deepEqual(result.accepted, ['a']);
});

test('file budget is not reported as cancel or total bytes', async () => {
  const result = await takeUntilStop(['a', 'b', 'c'], {
    isCancelled: () => false,
    maxFiles: 2,
    maxTotalBytes: 100,
    byteLength: accepted => accepted.join('').length
  });

  assert.equal(result.stop, 'file-budget');
  assert.deepEqual(result.accepted, ['a', 'b']);
});
