import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { readContextText } from '../src/infrastructure/filesystem/read-context-file';

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
  assert.equal(
    readContextText(filePath, () => ''),
    ''
  );
});
