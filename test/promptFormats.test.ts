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
  assert.equal(languageFor('src/app.blade.php'), 'blade');
  assert.match(rendered, new RegExp(`### src/app.ts\\n${fence}ts\\n`));
});

test('markdown names each file and groups git changes', () => {
  assert.equal(languageFor('ci.yml'), 'yaml');
  assert.equal(languageFor('ci.yaml'), 'yaml');
  assert.equal(languageFor('App.tsx'), 'tsx');
  assert.equal(languageFor('App.jsx'), 'jsx');
  assert.equal(languageFor('run.sh'), 'sh');
  assert.equal(languageFor('Dockerfile'), 'dockerfile');
  assert.equal(languageFor('src/app.blade.php'), 'blade');

  const rendered = renderPrompt('markdown', {
    files: [{ name: 'src/app.ts', content: 'export const a = 1;' }],
    changes: [
      {
        repo: 'api',
        path: 'src/a.ts',
        status: 'modified',
        scope: 'uncommitted',
        base: 'main',
        head: 'HEAD',
        diff: 'diff --git a/src/a.ts b/src/a.ts'
      }
    ]
  });

  assert.match(rendered, /## Cambios de Git — api \(sin commit, main → HEAD\)/);
  assert.match(rendered, /### src\/a.ts \(Modified\)/);
  assert.match(rendered, /### src\/app.ts\n```ts/);
});

test('plain text distinguishes a diff from a file with the same path', () => {
  const rendered = renderPrompt('plain', {
    files: [{ name: 'src/a.ts', content: 'export const a = 1;' }],
    changes: [
      {
        repo: 'api',
        path: 'src/a.ts',
        status: 'modified',
        diff: 'diff body'
      }
    ]
  });

  assert.match(rendered, /=== DIFF src\/a.ts \(Modified\) ===/);
  assert.match(rendered, /=== FILE src\/a.ts ===/);
  assert.equal(rendered.includes('--- src/a.ts ---'), false);
});

test('plain text separates files by path', () => {
  const rendered = renderPrompt('plain', {
    files: [{ name: 'src/a.ts', content: 'export const a = 1;' }],
    changes: [
      { repo: 'api', path: 'src/a.ts', status: 'modified', diff: 'diff' }
    ]
  });

  assert.match(rendered, /=== FILE src\/a.ts ===/);
  assert.match(rendered, /export const a = 1;/);
});
