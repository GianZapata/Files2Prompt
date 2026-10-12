import assert from 'node:assert/strict';
import test from 'node:test';

import {
  overLimitNotice,
  selectionStatus,
  shouldConfirmIgnored
} from '../src/selectionBudget';

test('status text includes git changes and a readable breakdown', () => {
  const status = selectionStatus({
    fileCount: 12,
    byteLabel: '4.2 KB',
    changeCount: 3,
    repositoryCount: 2
  });

  assert.match(status.text, /12/);
  assert.match(status.text, /4\.2 KB/);
  assert.match(status.text, /3/);
  assert.match(status.tooltip, /2 repositories/);
  assert.match(status.accessibility, /12 selected files/);
});

test('ignored-folder confirmation can be skipped for the project', () => {
  assert.equal(shouldConfirmIgnored({ setting: true, remembered: false }), true);
  assert.equal(shouldConfirmIgnored({ setting: true, remembered: true }), false);
  assert.equal(shouldConfirmIgnored({ setting: false, remembered: false }), false);
});

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
