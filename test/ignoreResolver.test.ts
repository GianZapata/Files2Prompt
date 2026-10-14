import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { checkboxForFolder } from '../src/domain/services/parent-check.service';
import { filesSelectedByFolder } from '../src/infrastructure/filesystem/select-files.walker';
import { createIgnoreResolver } from '../src/infrastructure/ignore/ignore-resolver.service';

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

test('nested gitignore rules match below their folder and keep a reinclude', () => {
  const root = makeRoot();

  write(
    root,
    'launcher/api/.gitignore',
    '*.log\n.env.*\n/vendor\n!.env.example\n'
  );
  write(root, 'launcher/api/storage/x.log', 'log');
  write(root, 'launcher/api/.env.local', 'secret');
  write(root, 'launcher/api/.env.example', 'example');
  write(root, 'launcher/api/vendor/pkg/index.php', '<?php');
  write(root, 'launcher/api/packages/vendor/keep.php', '<?php');
  write(
    root,
    'launcher/web/.gitignore',
    'node_modules\n.worktrees/\n.env.*\n!.env.example\n'
  );
  write(root, 'launcher/web/src/node_modules/pkg/index.js', 'x');
  write(root, 'launcher/web/.worktrees/feature/.git', 'gitdir: /tmp/panel.git');
  write(root, 'launcher/web/.env.example', 'example');
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(
    resolver.resolve('launcher/api/storage/x.log', 'file').included,
    false
  );
  assert.equal(
    resolver.resolve('launcher/api/.env.local', 'file').included,
    false
  );
  assert.equal(
    resolver.resolve('launcher/api/.env.example', 'file').included,
    true
  );
  assert.equal(
    resolver.resolve('launcher/api/vendor/pkg/index.php', 'file').included,
    false
  );
  assert.equal(
    resolver.resolve('launcher/api/packages/vendor/keep.php', 'file').included,
    true
  );
  assert.equal(
    resolver.resolve('launcher/web/src/node_modules/pkg/index.js', 'file')
      .included,
    false
  );
  assert.equal(
    resolver.resolve('launcher/web/.worktrees/feature/.git', 'file').included,
    false
  );
  assert.equal(
    resolver.resolve('launcher/web/.env.example', 'file').included,
    true
  );
});

test('test-results ignored only by gitignore still gets a checkbox', () => {
  const root = makeRoot();

  write(root, '.gitignore', 'test-results/\n');
  write(root, 'test-results/out.txt', 'x');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const decision = resolver.resolve('test-results', 'directory');

  assert.equal(decision.included, false);
  assert.equal(decision.reason, 'gitignore');
  assert.equal(
    checkboxForFolder({
      included: decision.included,
      reason: decision.reason
    }),
    'unchecked'
  );
});

test('a .git file is excluded even when it is not a directory', () => {
  const root = makeRoot();
  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('repo/.git', 'file').included, false);
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

test('CRLF gitignore and promptignore files keep clean patterns and sources', () => {
  const root = makeRoot();

  write(root, '.gitignore', '# comment\r\nsecret.txt\r\n\r\nbuild-out/\r\n');
  write(root, '.promptignore', 'notes.md\r\n');
  write(root, 'pkg/.gitignore', 'tmp.log\r\n');
  const resolver = createIgnoreResolver({ workspaceRoot: root });
  const secret = resolver.explain('secret.txt', 'file');
  const notes = resolver.explain('notes.md', 'file');
  const nested = resolver.explain('pkg/deep/tmp.log', 'file');

  assert.equal(secret.included, false);
  assert.equal(secret.pattern, 'secret.txt');
  assert.equal(secret.sourceFile, '.gitignore');
  assert.equal(resolver.resolve('build-out', 'directory').included, false);
  assert.equal(notes.included, false);
  assert.equal(notes.pattern, 'notes.md');
  assert.equal(notes.sourceFile, '.promptignore');
  assert.equal(nested.included, false);
  assert.equal(nested.pattern?.includes('\r'), false);
  assert.equal(resolver.resolve('src/app.ts', 'file').included, true);
});
