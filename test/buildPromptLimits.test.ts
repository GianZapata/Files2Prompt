import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { buildPrompt } from '../src/infrastructure/builders/prompt-builder.service';

test('file budget reports pending work when nothing else was excluded', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-budget-'));
  const files = ['a.ts', 'b.ts', 'c.ts'].map(name => {
    const filePath = path.join(root, name);

    fs.writeFileSync(filePath, name);

    return filePath;
  });

  const result = await buildPrompt({
    workspaceRoot: root,
    filePaths: files,
    resolve: () => ({ included: true }),
    openText: () => undefined,
    isCancelled: () => false,
    maxFileBytes: 1048576,
    maxTotalBytes: 8388608,
    maxFiles: 1
  });

  assert.equal(result.stop, 'file-budget');
  assert.equal(result.omittedFiles.length, 0);
  assert.equal(result.included.length, 1);
  assert.equal(result.pending, 2);
  assert.equal(result.byteLength, Buffer.byteLength(result.output));
});
