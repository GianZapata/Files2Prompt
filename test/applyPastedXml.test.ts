import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { applyPastedXml } from '../src/applyPastedXml';
import { serializePrompt } from '../src/promptXml';

test('a valid file and an escape path write nothing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-apply-'));
  let mkdirCalls = 0;
  let writeCalls = 0;
  const xml = serializePrompt({
    files: [
      { name: 'ok.ts', content: 'ok' },
      { name: '../evil-escape.txt', content: 'no' }
    ]
  });
  const result = await applyPastedXml({
    xml,
    workspaceRoot: root,
    isDirty: () => false,
    exists: () => false,
    mkdir: async () => {
      mkdirCalls += 1;
    },
    write: async () => {
      writeCalls += 1;
    },
    read: async () => ''
  });

  assert.equal(result.reason, 'invalid-path');
  assert.equal(result.mkdirCalls, 0);
  assert.equal(mkdirCalls, 0);
  assert.equal(writeCalls, 0);
});

test('a dirty destination blocks the whole batch', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-dirty-batch-'));
  const target = path.join(root, 'keep.ts');

  fs.writeFileSync(target, 'original');
  const xml = serializePrompt({
    files: [
      { name: 'keep.ts', content: 'changed' },
      { name: 'other.ts', content: 'new' }
    ]
  });
  const result = await applyPastedXml({
    xml,
    workspaceRoot: root,
    isDirty: absolutePath => absolutePath === target,
    exists: absolutePath => absolutePath === target,
    mkdir: async () => undefined,
    write: async () => {
      throw new Error('must not write');
    },
    read: async () => 'original'
  });

  assert.equal(result.reason, 'unsaved-conflict');
  assert.equal(fs.readFileSync(target, 'utf8'), 'original');
});

test('ampersand name and cdata round-trip through paste', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-round-'));
  const xml = serializePrompt({
    files: [{ name: 'a&b.ts', content: 'has ]]> inside' }]
  });
  const files = new Map<string, string>();
  const result = await applyPastedXml({
    xml,
    workspaceRoot: root,
    isDirty: () => false,
    exists: () => false,
    mkdir: async () => undefined,
    write: async (filePath, content) => {
      files.set(filePath, content);
    },
    read: async () => ''
  });

  assert.equal(result.reason, 'ok');
  assert.equal(files.get(path.join(root, 'a&b.ts')), 'has ]]> inside');
});
