import assert from 'node:assert/strict';
import test from 'node:test';

import { fenceFor, languageFor, renderPrompt } from '../src/promptFormats';

test('markdown fence is longer than the longest backtick run', () => {
  const content = 'const sample = ```code```;';
  const rendered = renderPrompt('markdown', {
    files: [{ name: 'src/app.ts', content }]
  });
  const fence = fenceFor(content);

  assert.equal(fence.length, 4);
  assert.equal(languageFor('src/app.blade.php'), 'php');
  assert.equal(rendered.startsWith(`${fence}ts\n`), true);
});

test('plain text separates files by path', () => {
  const rendered = renderPrompt('plain', {
    files: [{ name: 'src/a.ts', content: 'export const a = 1;' }],
    changes: [
      { repo: 'api', path: 'src/a.ts', status: 'modified', diff: 'diff' }
    ]
  });

  assert.match(rendered, /--- src\/a.ts ---/);
  assert.match(rendered, /export const a = 1;/);
});
