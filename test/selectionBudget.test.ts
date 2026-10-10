import assert from 'node:assert/strict';
import test from 'node:test';

import { overLimitNotice } from '../src/selectionBudget';

test('over-limit notice names the setting and hides internal codes', () => {
  const notice = overLimitNotice({
    fileCount: 5001,
    byteCount: 10,
    maxFiles: 5000,
    maxTotalBytes: 100
  });

  assert.equal(notice.over, true);
  assert.equal(notice.message.includes('file-budget'), false);
  assert.match(notice.message, /files2prompt\.maxFiles/);
  assert.equal(notice.args[1], 1);
});
