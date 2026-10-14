import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'path';

import {
  createSavedPromptRegistry,
  savedPromptRelativePath
} from '../src/domain/services/saved-prompt-registry.service';

test('saved prompt registry remembers paths without duplicates', () => {
  const registry = createSavedPromptRegistry(['out/a.md']);

  registry.register('out/b.md');
  registry.register('out/a.md');

  assert.equal(registry.has('out/a.md'), true);
  assert.equal(registry.has('out/b.md'), true);
  assert.equal(registry.has('out/c.md'), false);
  assert.deepEqual(registry.list(), ['out/a.md', 'out/b.md']);
});

test('saved prompt registry keeps only the most recent entries', () => {
  const registry = createSavedPromptRegistry([], 2);

  registry.register('1.md');
  registry.register('2.md');
  registry.register('3.md');

  assert.deepEqual(registry.list(), ['2.md', '3.md']);
  assert.equal(registry.has('1.md'), false);
});

test('only files inside the workspace become a relative registry path', () => {
  assert.equal(
    savedPromptRelativePath('/ws', '/ws/out/p.md', path.posix),
    'out/p.md'
  );

  assert.equal(
    savedPromptRelativePath('/ws', '/ws-other/p.md', path.posix),
    undefined
  );

  assert.equal(
    savedPromptRelativePath('/ws', '/tmp/promptfold/p.md', path.posix),
    undefined
  );

  assert.equal(savedPromptRelativePath('/ws', '/ws', path.posix), undefined);
});

test('win32 registry paths ignore drive letter case and use slashes', () => {
  assert.equal(
    savedPromptRelativePath('C:\\ws', 'c:\\ws\\out\\p.md', path.win32),
    'out/p.md'
  );

  assert.equal(
    savedPromptRelativePath('C:\\ws', 'D:\\ws\\out\\p.md', path.win32),
    undefined
  );
});
