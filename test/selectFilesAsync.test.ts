import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { createIgnoreResolver } from '../src/ignore/ignoreResolver';
import { filesSelectedByFolderAsync } from '../src/ignore/selectFiles';

test('a cancelled folder walk returns no files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-async-'));

  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const result = await filesSelectedByFolderAsync(
    root,
    root,
    resolver.resolve,
    { isCancelled: () => true, yieldEvery: 1 }
  );

  assert.equal(result.cancelled, true);
  assert.deepEqual(result.files, []);
});
