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

  assert.match(rendered, /## Git changes — api \(uncommitted, main → HEAD\)/);
  assert.match(rendered, /### src\/a.ts \(modified\)/);
  assert.equal(rendered.includes('Cambios de Git'), false);
  assert.match(rendered, /### src\/app.ts\n```ts/);
});

test('binary and empty diffs are notes, not code blocks', () => {
  const changes = [
    {
      repo: 'api',
      path: 'logo.png',
      status: 'modified',
      binary: true,
      diff: 'should-not-appear'
    },
    {
      repo: 'api',
      path: 'empty.ts',
      status: 'modified',
      diff: '   '
    }
  ];
  const markdown = renderPrompt('markdown', { files: [], changes });
  const plain = renderPrompt('plain', { files: [], changes });

  assert.match(markdown, /### logo.png \(modified\)\n_Binary file, no diff._/);
  assert.equal(markdown.includes('```'), false);
  assert.equal(markdown.includes('should-not-appear'), false);
  assert.match(markdown, /### empty.ts \(modified\)\n_No diff._/);
  assert.match(plain, /=== DIFF logo.png \(modified, binary\) ===/);
  assert.equal(plain.includes('should-not-appear'), false);
  assert.match(plain, /=== DIFF empty.ts \(modified\) ===\n\(no diff\)/);
  assert.equal(plain.includes('_No diff._'), false);
  assert.equal(plain.includes('```'), false);
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

  assert.match(rendered, /=== DIFF src\/a.ts \(modified\) ===/);
  assert.match(rendered, /=== FILE src\/a.ts ===/);
  assert.equal(rendered.includes('--- src/a.ts ---'), false);
});

test('xml keeps lowercase English status and scope', () => {
  const rendered = renderPrompt('xml', {
    files: [],
    changes: [
      {
        repo: 'api',
        path: 'src/a.ts',
        status: 'Modified',
        scope: 'uncommitted',
        diff: 'diff'
      }
    ]
  });

  assert.match(rendered, /scope="uncommitted"/);
  assert.match(rendered, /status="modified"/);
  assert.equal(rendered.includes('Cambios'), false);
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
