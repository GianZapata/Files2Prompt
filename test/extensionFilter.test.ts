import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extensionPickItems,
  extensionSuffix,
  filterByExtensions,
  matchesExtension,
  parseExtensionList
} from '../src/extensionFilter';

test('suffix match keeps compound extensions and dotfiles', () => {
  assert.equal(extensionSuffix('src/foo.blade.php'), '.blade.php');
  assert.equal(extensionSuffix('types/foo.d.ts'), '.d.ts');
  assert.equal(extensionSuffix('.env'), '.env');
  assert.equal(extensionSuffix('README'), '');
  assert.equal(matchesExtension('src/foo.blade.php', 'php'), true);
  assert.equal(matchesExtension('src/foo.blade.php', '.blade.php'), true);
  assert.equal(matchesExtension('.env', 'env'), true);
  assert.equal(matchesExtension('README', ''), true);
  assert.equal(matchesExtension('README', 'md'), false);
  assert.deepEqual(parseExtensionList(' md, TS, php '), ['.md', '.ts', '.php']);
  assert.deepEqual(parseExtensionList('.md, .ts, php'), ['.md', '.ts', '.php']);
  assert.deepEqual(
    filterByExtensions(
      ['src/a.blade.php', 'README', '.env', 'src/b.ts'],
      ['.blade.php', '.env']
    ),
    ['src/a.blade.php', '.env']
  );
});

test('typed extension list is a direct pick option', () => {
  const detected = [{ label: '.ts (2)', description: '2', suffixes: ['.ts'] }];

  assert.deepEqual(extensionPickItems(detected, 'md, ts, php'), [
    {
      label: 'md, ts, php',
      description: '.md, .ts, .php',
      suffixes: ['.md', '.ts', '.php'],
      alwaysShow: true
    },
    ...detected
  ]);
  assert.equal(extensionPickItems(detected, '   '), detected);
});
