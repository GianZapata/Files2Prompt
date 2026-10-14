import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import {
  restoreEffective,
  uncheckFolder
} from '../src/domain/services/selection-state.service';
import { buildPrompt } from '../src/infrastructure/builders/prompt-builder.service';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-build-'));

test('skips a file over the byte cap without reading it into the prompt', async () => {
  const workspace = root();
  const filePath = path.join(workspace, 'huge.txt');

  fs.writeFileSync(filePath, 'x'.repeat(20));

  const result = await buildPrompt({
    workspaceRoot: workspace,
    filePaths: [filePath],
    resolve: () => ({ included: true }),
    openText: () => undefined,
    isCancelled: () => false,
    maxFileBytes: 8,
    maxTotalBytes: 1000,
    maxFiles: 5000
  });

  assert.equal(result.omittedFiles[0]?.reason, 'file-size');
  assert.equal(result.included.length, 0);
});

test('treats a NUL sample as binary', async () => {
  const workspace = root();
  const filePath = path.join(workspace, 'data.bin');

  fs.writeFileSync(filePath, Buffer.from([0x61, 0x00, 0x62]));

  const result = await buildPrompt({
    workspaceRoot: workspace,
    filePaths: [filePath],
    resolve: () => ({ included: true }),
    openText: () => undefined,
    isCancelled: () => false,
    maxFileBytes: 1048576,
    maxTotalBytes: 8388608,
    maxFiles: 5000
  });

  assert.equal(result.omittedFiles[0]?.reason, 'binary');
});

test('cancel returns no payload', async () => {
  const workspace = root();
  const filePath = path.join(workspace, 'a.ts');

  fs.writeFileSync(filePath, 'a');

  const result = await buildPrompt({
    workspaceRoot: workspace,
    filePaths: [filePath],
    resolve: () => ({ included: true }),
    openText: () => undefined,
    isCancelled: () => true,
    maxFileBytes: 1048576,
    maxTotalBytes: 8388608,
    maxFiles: 5000
  });

  assert.equal(result.stop, 'user-cancelled');
  assert.equal(result.output, '');
});

test('uncheck keeps a file unmarked after the ignore is removed', () => {
  const checked = new Set(['/repo/pkg/keep.ts']);

  uncheckFolder(checked, '/repo/pkg');

  assert.equal(checked.has('/repo/pkg/keep.ts'), false);
  assert.deepEqual(
    restoreEffective(
      ['/repo/pkg/keep.ts', '/repo/missing.ts'],
      () => false,
      () => true
    ),
    []
  );
});
