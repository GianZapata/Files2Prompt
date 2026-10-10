import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { createIgnoreResolver } from '../src/ignore/ignoreResolver';
import { filesSelectedByFolder } from '../src/ignore/selectFiles';

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-ignore-'));

const write = (root: string, relativePath: string, content = 'ok') => {
  const fullPath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);

  return fullPath;
};

test('node_modules and dist directories are excluded', () => {
  const root = makeRoot();
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('node_modules', 'directory').included, false);
  assert.equal(resolver.resolve('dist', 'directory').included, false);
  assert.equal(resolver.resolve('src/app.ts', 'file').included, true);
});

test('gitignore content stays cached until invalidate', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'secret.txt\n');
  write(root, 'secret.txt');
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('secret.txt', 'file').included, false);
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  assert.equal(resolver.resolve('secret.txt', 'file').included, false);
  resolver.invalidate(path.join(root, '.gitignore'));
  assert.equal(resolver.resolve('secret.txt', 'file').included, true);
});

test('a forced gitignore folder includes its files but not nested node_modules', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'odd/\n');
  write(root, 'odd/keep.ts', 'export const keep = 1;\n');
  write(root, 'odd/node_modules/pkg/index.js', 'module.exports = 1;\n');
  write(root, 'odd/.gitignore', 'secret.ts\n');
  write(root, 'odd/secret.ts', 'export const secret = 1;\n');
  write(root, 'odd/photo.png', 'not-really\n');
  const resolver = createIgnoreResolver({
    workspaceRoot: root,
    forcedRoots: [
      {
        relativePath: 'odd',
        pattern: 'odd/',
        sourceFile: '.gitignore'
      }
    ]
  });

  assert.equal(resolver.resolve('odd/keep.ts', 'file').included, true);
  assert.equal(resolver.resolve('odd/keep.ts', 'file').manual, true);
  assert.equal(
    resolver.resolve('odd/node_modules', 'directory').included,
    false
  );
  assert.equal(resolver.resolve('odd/secret.ts', 'file').included, false);
  assert.equal(resolver.resolve('odd/photo.png', 'file').included, false);
  assert.equal(resolver.resolve('odd', 'directory').included, true);
});

test('a promptignore folder cannot be forced', () => {
  const root = makeRoot();

  write(root, '.promptignore', 'secrets/\n');
  write(root, 'secrets/keep.txt', 'no\n');
  const resolver = createIgnoreResolver({
    workspaceRoot: root,
    forcedRoots: [
      {
        relativePath: 'secrets',
        pattern: 'secrets/',
        sourceFile: '.promptignore'
      }
    ]
  });

  assert.equal(resolver.resolve('secrets/keep.txt', 'file').included, false);
  assert.equal(resolver.explain('secrets', 'directory').reason, 'promptignore');
});

test('checking the workspace root does not force a gitignored folder', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'odd/\n');
  write(root, 'odd/keep.ts', 'export const keep = 1;\n');
  write(root, 'src/app.ts', 'export const app = 1;\n');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const selected = filesSelectedByFolder(root, root, resolver.resolve).map(
    file => path.relative(root, file)
  );

  assert.equal(selected.includes('odd/keep.ts'), false);
  assert.equal(selected.includes('src/app.ts'), true);
});

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
