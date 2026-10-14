import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { isSameOrInside } from '../src/domain/helpers/path-containment';
import { selectionRoots } from '../src/infrastructure/filesystem/select-files.walker';

test('a path is inside itself and inside its ancestors', () => {
  assert.equal(isSameOrInside('/ws', '/ws', path.posix), true);
  assert.equal(isSameOrInside('/ws', '/ws/a/b.ts', path.posix), true);
  assert.equal(isSameOrInside('/ws/', '/ws/a', path.posix), true);
});

test('a sibling that shares the name prefix is not inside', () => {
  assert.equal(isSameOrInside('/ws', '/ws-other/a.ts', path.posix), false);
  assert.equal(
    isSameOrInside('C:\\ws', 'C:\\ws-other\\a.ts', path.win32),
    false
  );
});

test('parent traversal is outside but a dotted name is inside', () => {
  assert.equal(isSameOrInside('/ws', '/ws/../etc', path.posix), false);
  assert.equal(isSameOrInside('/ws', '/ws/..cache/a', path.posix), true);
});

test('posix paths stay case sensitive', () => {
  assert.equal(isSameOrInside('/ws', '/WS/a', path.posix), false);
});

test('win32 ignores case and the drive letter case', () => {
  assert.equal(isSameOrInside('C:\\ws', 'c:\\WS\\src\\a.ts', path.win32), true);
  assert.equal(
    isSameOrInside('c:\\Users\\Ana', 'C:\\users\\ana', path.win32),
    true
  );
});

test('win32 accepts mixed separators and rejects another drive', () => {
  assert.equal(isSameOrInside('C:\\ws', 'C:/ws/a/b', path.win32), true);
  assert.equal(isSameOrInside('C:/ws', 'C:\\ws\\a', path.win32), true);
  assert.equal(isSameOrInside('C:\\ws', 'D:\\ws\\a.ts', path.win32), false);
});

test('a selection outside the workspace falls back to the workspace root', () => {
  const root = path.resolve('/ws');

  assert.deepEqual(selectionRoots(root, [path.resolve('/ws-other/a.ts')]), [
    root
  ]);

  assert.deepEqual(selectionRoots(root, [path.resolve('/ws/pkg/a.ts')]), [
    path.resolve('/ws/pkg')
  ]);
});
