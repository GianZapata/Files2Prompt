import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';

import { readContextText } from '../src/readContextFile';

test('uses the open buffer when it differs from disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-read-'));
  const filePath = path.join(root, 'app.ts');

  fs.writeFileSync(filePath, 'disk');

  assert.equal(
    readContextText(filePath, () => 'editor'),
    'editor'
  );
  assert.equal(
    readContextText(filePath, () => undefined),
    'disk'
  );
});
