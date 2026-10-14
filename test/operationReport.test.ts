import type { PromptBuild } from '../src/domain/entities/prompt-payload.entity';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCopyGate } from '../src/domain/services/copy-gate.service';
import {
  createDetailBook,
  formatOperationReport,
  isEmptySelection
} from '../src/domain/services/operation-report.service';
import { DeliverPrompt } from '../src/domain/use-cases/prompt/deliver-prompt.use-case';

const summary = (name: string, count: number): PromptBuild => ({
  stop: 'completed',
  output: name,
  included: Array.from({ length: count }, (_, index) => ({
    name: `${name}-${index}.ts`,
    content: 'x'
  })),
  omittedFiles: [],
  omittedFolders: [],
  pending: 0,
  byteLength: Buffer.byteLength(name)
});

test('details for A stay A after B, and opening them does not write', () => {
  const book = createDetailBook();
  const writes: string[] = [];
  const open = (id: string) => {
    writes.push('open');

    return book.open(id);
  };
  const idA = book.save(
    formatOperationReport({
      kind: 'copy',
      summary: summary('A', 1),
      wrote: true
    })
  );
  const idB = book.save(
    formatOperationReport({
      kind: 'copy',
      summary: summary('B', 3),
      wrote: true
    })
  );

  assert.match(open(idA) ?? '', /A-0\.ts/);
  assert.doesNotMatch(open(idA) ?? '', /B-0\.ts/);
  assert.match(book.open(idB) ?? '', /B-0\.ts/);
  assert.equal(writes.includes('clipboard'), false);
  assert.equal(book.latest(), book.open(idB));
});

test('cancel report says collected files were not copied', () => {
  const report = formatOperationReport({
    kind: 'cancelled',
    wrote: false,
    summary: {
      ...summary('cancel', 291),
      stop: 'user-cancelled',
      output: ''
    }
  });

  assert.match(report, /Collected: 291/);
  assert.match(report, /Copied: 0/);
  assert.match(report, /Clipboard write: no/);
  assert.match(report, /Stop: user-cancelled/);
});

test('empty selection does not start a copy and the next copy can start', async () => {
  assert.equal(isEmptySelection([], []), true);

  const gate = createCopyGate();
  const writes: string[] = [];
  const skipped = isEmptySelection([], []);

  assert.equal(skipped, true);
  assert.equal(writes.length, 0);

  const next = await new DeliverPrompt(
    { build: async () => summary('next', 1) },
    gate
  ).execute(
    { filePaths: [] },
    {
      write: async text => {
        writes.push(text);
      }
    }
  );

  assert.equal(next.started, true);
  assert.equal(next.wrote, true);
  assert.deepEqual(writes, ['next']);
});

test('details name a saved prompt left out of the selection', () => {
  const report = formatOperationReport({
    kind: 'copy',
    wrote: true,
    summary: {
      ...summary('A', 1),
      omittedFiles: [{ path: 'out/prompt.md', reason: 'saved-prompt' }]
    }
  });

  assert.match(report, /out\/prompt\.md — saved-prompt/);
});

test('details name a secret left out and the rule that caught it', () => {
  const report = formatOperationReport({
    kind: 'copy',
    wrote: true,
    summary: {
      ...summary('A', 1),
      omittedFiles: [{ path: 'api/.env', reason: 'sensitive', pattern: '.env' }]
    }
  });

  assert.match(report, /api\/\.env — sensitive \(\.env\)/);
});
