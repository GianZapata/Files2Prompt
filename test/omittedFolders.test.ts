import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { createIgnoreResolver } from '../src/ignore/ignoreResolver';
import { omittedFoldersForSelection } from '../src/ignore/selectFiles';

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-omit-'));

const write = (root: string, relativePath: string) => {
  const fullPath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, 'x');

  return fullPath;
};

test('two excluded folders stay in the summary regardless of click order', () => {
  const root = makeRoot();

  write(root, 'node_modules/pkg/index.js');
  write(root, 'src/__pycache__/main.pyc');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const first = path.join(root, 'node_modules');
  const second = path.join(root, 'src/__pycache__');
  const forward = omittedFoldersForSelection(
    root,
    [first, second],
    resolver.resolve
  );
  const reverse = omittedFoldersForSelection(
    root,
    [second, first],
    resolver.resolve
  );

  assert.deepEqual(forward, reverse);
  assert.equal(forward.length, 2);
  assert.equal(
    omittedFoldersForSelection(root, [first, second], resolver.resolve).length,
    omittedFoldersForSelection(root, [first, second], resolver.resolve).length
  );
});

test('uncheck and clear drop omitted folders from the current selection', () => {
  const root = makeRoot();

  write(root, 'node_modules/pkg/index.js');
  write(root, 'src/__pycache__/main.pyc');
  const nodeModules = path.join(root, 'node_modules');
  const pycache = path.join(root, 'src/__pycache__');
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(
    omittedFoldersForSelection(root, [nodeModules], resolver.resolve).length,
    1
  );
  assert.deepEqual(omittedFoldersForSelection(root, [], resolver.resolve), []);
  assert.equal(
    omittedFoldersForSelection(root, [pycache], resolver.resolve)[0],
    'src/__pycache__'
  );
});

test('a checked root does not duplicate a nested excluded folder', () => {
  const root = makeRoot();

  write(root, 'node_modules/pkg/index.js');
  write(root, 'src/app.py');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const nested = path.join(root, 'node_modules');
  const folders = omittedFoldersForSelection(
    root,
    [root, nested],
    resolver.resolve
  );

  assert.equal(folders.filter(folder => folder === 'node_modules').length, 1);
});
