import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';

import { createIgnoreResolver } from '../src/ignore/ignoreResolver';
import { filesSelectedByFolder } from '../src/ignore/selectFiles';

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-ignore-'));

const write = (root: string, relativePath: string, content = 'ok') => {
  const fullPath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);

  return fullPath;
};

test('folder selection includes allowed files and skips pycache', () => {
  const root = makeRoot();

  write(root, 'src/main.py');
  write(root, 'src/__pycache__/main.cpython-313.pyc', 'bin');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const selected = filesSelectedByFolder(root, root, resolver.resolve).map(
    file => path.relative(root, file)
  );

  assert.deepEqual(selected, ['src/main.py']);
});

test('a folder that contains gitignore still selects its direct file', () => {
  const root = makeRoot();
  const folder = path.join(root, 'pkg');

  write(root, 'pkg/.gitignore', '');
  write(root, 'pkg/keep.ts');
  write(root, 'pkg/nested/also.ts');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const fromFolder = filesSelectedByFolder(root, folder, resolver.resolve).map(
    file => path.relative(root, file)
  );
  const individual = [
    'pkg/.gitignore',
    'pkg/keep.ts',
    'pkg/nested/also.ts'
  ].sort();

  assert.deepEqual(fromFolder, individual);
  assert.equal(resolver.resolve('', 'directory').included, true);
});

test('promptignore cannot reinclude a file while its parent stays excluded', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'secrets/\n');
  write(root, '.promptignore', '!secrets/keep.txt\n');
  write(root, 'secrets/keep.txt');
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('secrets/keep.txt', 'file').included, false);
});

test('reincluding the parent then the file includes it', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'secrets/\n');
  write(root, '.promptignore', '!secrets/\n!secrets/keep.txt\n');
  write(root, 'secrets/keep.txt');
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('secrets/keep.txt', 'file').included, true);
});
