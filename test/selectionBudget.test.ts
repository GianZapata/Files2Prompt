import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatForCopy,
  nextOutputFormat,
  overLimitNotice,
  selectionStatus,
  shouldConfirmIgnored,
  shouldRefreshSummary
} from '../src/domain/services/selection-budget.service';

test('status text includes git changes and a readable breakdown', () => {
  const status = selectionStatus({
    fileCount: 12,
    byteLabel: '4.2 KB',
    tokens: 1100,
    tokenBudget: 0,
    changeCount: 3,
    repositoryCount: 2,
    format: 'markdown'
  });

  assert.match(status.text, /12 files · ~1\.1k tokens · Markdown/);
  assert.match(status.tooltip, /2 repositories/);
  assert.match(status.tooltip, /Markdown/);
  assert.match(status.accessibility, /Choose the output format/);
});

test('an empty selection still names the output format', () => {
  const status = selectionStatus({
    fileCount: 0,
    byteLabel: '0 B',
    tokens: 0,
    tokenBudget: 0,
    changeCount: 0,
    repositoryCount: 0,
    format: 'xml'
  });

  assert.match(status.text, /0 files · ~0 tokens · XML/);
  assert.match(status.tooltip, /XML/);
  assert.match(status.accessibility, /Choose the output format/);
});

test('choosing a format does not write the clipboard', () => {
  const kept = nextOutputFormat('xml', undefined);
  const changed = nextOutputFormat('xml', 'markdown');

  assert.equal(kept.format, 'xml');
  assert.equal(kept.changed, false);
  assert.equal(kept.wroteClipboard, false);
  assert.equal(changed.format, 'markdown');
  assert.equal(changed.changed, true);
  assert.equal(changed.wroteClipboard, false);
  assert.equal(shouldRefreshSummary('files2prompt.outputFormat'), true);
  assert.equal(shouldRefreshSummary('files2prompt.maxFiles'), false);
  assert.equal(formatForCopy('markdown'), 'markdown');
  assert.equal(formatForCopy('markdown', 'xml'), 'xml');
});

test('ignored-folder confirmation can be skipped for the project', () => {
  assert.equal(
    shouldConfirmIgnored({ setting: true, remembered: false }),
    true
  );
  assert.equal(
    shouldConfirmIgnored({ setting: true, remembered: true }),
    false
  );
  assert.equal(
    shouldConfirmIgnored({ setting: false, remembered: false }),
    false
  );
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
