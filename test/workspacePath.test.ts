import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { planPaste } from '../src/pastePlan';
import { resolveInsideWorkspace } from '../src/workspacePath';

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-path-'));

test('rejects parent and absolute paths', () => {
  const root = makeRoot();

  assert.equal(resolveInsideWorkspace(root, '../outside.ts'), undefined);
  assert.equal(resolveInsideWorkspace(root, '/tmp/outside.ts'), undefined);
  assert.equal(resolveInsideWorkspace(root, 'C:\\outside.ts'), undefined);
  assert.equal(resolveInsideWorkspace(root, ''), undefined);
  assert.equal(resolveInsideWorkspace(root, 'bad\0name.ts'), undefined);
});

test('resolves a normal path and a path with spaces', () => {
  const root = makeRoot();

  assert.equal(
    resolveInsideWorkspace(root, 'src/app.ts'),
    path.resolve(root, 'src/app.ts')
  );
  assert.equal(
    resolveInsideWorkspace(root, 'my file.ts'),
    path.resolve(root, 'my file.ts')
  );
});

test('rejects a symlink whose target leaves the workspace', () => {
  const root = makeRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-out-'));

  fs.symlinkSync(outside, path.join(root, 'linked'));

  assert.equal(resolveInsideWorkspace(root, 'linked/file.ts'), undefined);
});

test('planPaste writes nothing when any path is invalid, duplicate, or dirty', () => {
  const root = makeRoot();
  const dirtyPath = path.join(root, 'dirty.ts');

  fs.writeFileSync(dirtyPath, 'old');

  const invalid = planPaste(
    root,
    [
      { name: 'ok.ts', content: 'a' },
      { name: '../outside.ts', content: 'b' }
    ],
    () => false
  );

  assert.equal(invalid.ok, false);

  const duplicate = planPaste(
    root,
    [
      { name: 'ok.ts', content: 'a' },
      { name: 'ok.ts', content: 'b' }
    ],
    () => false
  );

  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.reason, 'duplicate-path');
  }

  const dirty = planPaste(
    root,
    [{ name: 'dirty.ts', content: 'new' }],
    absolutePath => absolutePath === dirtyPath
  );

  assert.equal(dirty.ok, false);
  if (!dirty.ok) {
    assert.equal(dirty.reason, 'unsaved-conflict');
  }
});
