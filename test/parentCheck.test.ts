import assert from 'node:assert/strict';
import test from 'node:test';

import { parentCheckbox, watcherShouldRefresh } from '../src/parentCheck';

test('parent is checked when every visible child is checked', () => {
  assert.equal(
    parentCheckbox([
      { excluded: true, checked: false },
      { excluded: false, checked: true },
      { excluded: false, checked: true }
    ]),
    'checked'
  );
  assert.equal(
    parentCheckbox([
      { excluded: false, checked: true },
      { excluded: false, checked: false }
    ]),
    'unchecked'
  );
});

test('watcher ignores events inside an excluded directory', () => {
  const excluded = (directory: string) => directory === 'node_modules';

  assert.equal(
    watcherShouldRefresh('node_modules/pkg/index.js', excluded),
    false
  );
  assert.equal(watcherShouldRefresh('src/app.ts', excluded), true);
  assert.equal(watcherShouldRefresh('.gitignore', excluded), true);
});
