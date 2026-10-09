import type { PromptBuild } from '../src/buildPrompt';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCopyGate } from '../src/copyGate';
import { runCopy, runPreview } from '../src/promptRun';

const completed = (xml = '<files></files>'): PromptBuild => ({
  stop: 'completed',
  xml,
  included: [{ name: 'a.ts', content: 'a' }],
  omittedFiles: [],
  omittedFolders: [],
  pending: 0,
  byteLength: Buffer.byteLength(xml)
});

const clipboard = (text = 'SENTINEL') => {
  const writes: string[] = [];
  let current = text;

  return {
    writes,
    read: () => current,
    write: (value: string) => {
      writes.push(value);
      current = value;
    }
  };
};

test('a second copy does not start or write while the first is running', async () => {
  const gate = createCopyGate();
  const board = clipboard();
  let release: () => void = () => undefined;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  const first = runCopy({
    gate,
    clipboard: board,
    summarize: built => built,
    build: async () => {
      await hold;

      return completed('FIRST');
    },
    withProgress: work => work(() => false)
  });
  const second = await runCopy({
    gate,
    clipboard: board,
    summarize: built => built,
    build: async () => {
      throw new Error('second build must not run');
    },
    withProgress: work => work(() => false)
  });

  assert.equal(second.started, false);
  assert.equal(board.writes.length, 0);
  release();
  const finished = await first;

  assert.equal(finished.started, true);
  assert.equal(finished.wrote, true);
  assert.deepEqual(board.writes, ['FIRST']);

  const third = await runCopy({
    gate,
    clipboard: board,
    summarize: built => built,
    build: async () => completed('THIRD'),
    withProgress: work => work(() => false)
  });

  assert.equal(third.started, true);
  assert.equal(board.writes.at(-1), 'THIRD');
});

test('cancel keeps a non-empty clipboard and does not write', async () => {
  const gate = createCopyGate();
  const board = clipboard('SENTINEL');
  const result = await runCopy({
    gate,
    clipboard: board,
    summarize: built => built,
    build: async () => ({
      ...completed(),
      stop: 'user-cancelled',
      xml: '',
      included: [{ name: 'a.ts', content: 'collected' }]
    }),
    withProgress: work => work(() => true)
  });

  assert.equal(result.wrote, false);
  assert.equal(board.read(), 'SENTINEL');
  assert.equal(board.writes.length, 0);
});

test('preview does not write the clipboard', async () => {
  const board = clipboard('SENTINEL');
  const result = await runPreview({
    clipboard: board,
    build: async () =>
      completed('<files><file name="a.ts"><![CDATA[a]]></file></files>'),
    summarize: built => built
  });

  assert.equal(result.wrote, false);
  assert.equal(result.clipboard, 'SENTINEL');
  assert.equal(result.before, 'SENTINEL');
});
