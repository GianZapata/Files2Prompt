import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkboxForFolder,
  parentCheckbox,
  watcherShouldRefresh
} from '../src/domain/services/parent-check.service';

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

test('test-results in gitignore keeps a checkbox', () => {
  assert.equal(
    checkboxForFolder({ included: false, reason: 'gitignore' }),
    'unchecked'
  );
  assert.equal(
    checkboxForFolder({ included: false, reason: 'workspace-exclude' }),
    'unchecked'
  );
  assert.equal(
    checkboxForFolder({ included: false, reason: 'built-in' }),
    'hidden'
  );
  assert.equal(
    checkboxForFolder({ included: false, reason: 'promptignore' }),
    'hidden'
  );
});

test('a folder with no includable files does not uncheck its parent', () => {
  assert.equal(
    parentCheckbox([
      { excluded: false, checked: true },
      { excluded: false, checked: false, emptyFolder: true }
    ]),
    'checked'
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
