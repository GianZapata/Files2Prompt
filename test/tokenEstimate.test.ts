import assert from 'node:assert/strict';
import test from 'node:test';

import { CopyNoticeKind } from '../src/domain/entities/copy-notice-kind.enum';
import {
  copyNotice,
  selectionStatus
} from '../src/domain/services/selection-budget.service';
import {
  compactTokenCount,
  estimateTokens,
  estimateTokensFromBytes,
  formatTokenCount,
  heaviestFiles,
  tokenBudgetNotice
} from '../src/domain/services/token-estimate.service';

test('a token is about four characters, rounded up', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokensFromBytes(4097), 1025);
});

test('token counts are always shown as approximate', () => {
  assert.equal(formatTokenCount(0), '~0 tokens');
  assert.equal(formatTokenCount(950), '~950 tokens');
  assert.equal(formatTokenCount(12300), '~12.3k tokens');
  assert.equal(formatTokenCount(12000), '~12k tokens');
  assert.equal(formatTokenCount(1200000), '~1.2M tokens');
  assert.equal(formatTokenCount(999990), '~1M tokens');
  assert.equal(compactTokenCount(12300), '12.3k');
});

test('a budget of zero is off, and one that is met raises nothing', () => {
  assert.equal(tokenBudgetNotice({ tokens: 900000, budget: 0 }).over, false);
  assert.equal(tokenBudgetNotice({ tokens: 100, budget: 100 }).over, false);
});

test('a prompt over the budget names the setting and the excess', () => {
  const notice = tokenBudgetNotice({ tokens: 160000, budget: 150000 });

  assert.equal(notice.over, true);
  assert.match(notice.message, /files2prompt\.tokenBudget/);
  assert.deepEqual(notice.args, ['160k', '10k', '150k']);
});

test('over both the byte limit and the token budget raises one notice, bytes first', () => {
  const both = copyNotice({
    fileCount: 2,
    byteCount: 200,
    maxFiles: 10,
    maxTotalBytes: 100,
    tokens: 500,
    tokenBudget: 100
  });

  assert.equal(both.over, true);
  assert.equal(both.kind, CopyNoticeKind.Limit);
  assert.match(both.message, /files2prompt\.maxTotalBytes/);
});

test('only the token budget exceeded raises the token notice', () => {
  const tokens = copyNotice({
    fileCount: 2,
    byteCount: 50,
    maxFiles: 10,
    maxTotalBytes: 100,
    tokens: 500,
    tokenBudget: 100
  });

  assert.equal(tokens.kind, CopyNoticeKind.Tokens);
  assert.match(tokens.message, /files2prompt\.tokenBudget/);
});

test('inside every limit raises nothing', () => {
  const quiet = copyNotice({
    fileCount: 2,
    byteCount: 50,
    maxFiles: 10,
    maxTotalBytes: 100,
    tokens: 10,
    tokenBudget: 100
  });

  assert.equal(quiet.over, false);
  assert.equal(quiet.kind, undefined);
});

test('the status shows tokens, keeps bytes in the tooltip and flags the budget', () => {
  const status = selectionStatus({
    fileCount: 12,
    byteLabel: '4.2 KB',
    tokens: 1100,
    tokenBudget: 1000,
    changeCount: 0,
    repositoryCount: 0,
    format: 'markdown'
  });

  const within = selectionStatus({
    fileCount: 12,
    byteLabel: '4.2 KB',
    tokens: 1100,
    tokenBudget: 0,
    changeCount: 0,
    repositoryCount: 0,
    format: 'markdown'
  });

  assert.match(status.text, /12 files · ~1\.1k tokens · Markdown/);
  assert.equal(status.text.includes('4.2 KB'), false);
  assert.match(status.tooltip, /4\.2 KB/);
  assert.match(status.tooltip, /estimated from file sizes/);
  assert.equal(status.overBudget, true);
  assert.equal(within.overBudget, false);
});

test('the heaviest files come first, ties by name, capped to the limit', () => {
  const files = [
    { name: 'small.ts', content: 'a' },
    { name: 'b.ts', content: 'x'.repeat(40) },
    { name: 'a.ts', content: 'x'.repeat(40) },
    { name: 'huge.ts', content: 'x'.repeat(400) }
  ];

  assert.deepEqual(heaviestFiles(files, 3), [
    { name: 'huge.ts', tokens: 100 },
    { name: 'a.ts', tokens: 10 },
    { name: 'b.ts', tokens: 10 }
  ]);
});
