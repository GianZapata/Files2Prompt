import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { OutputFormat } from '../src/domain/entities/output-format.enum';
import { renderPrompt } from '../src/domain/services/prompt-formats.service';
import { createTreeAccumulator } from '../src/domain/services/prompt-tree.service';

import { repositoryFor } from './support/prompt-repository';

const workspaceWith = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-tree-'));

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(root, name);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return root;
};

const pathsOf = (root: string, names: string[]) =>
  names.map(name => path.join(root, name));

const treeOf = (paths: string[]) => {
  const tree = createTreeAccumulator();

  for (const posixPath of paths) {
    tree.add(posixPath);
  }

  return tree.render();
};

test('the tree lists directories first and indents by depth', () => {
  assert.equal(
    treeOf(['src/b.ts', 'README.md', 'src/lib/a.ts', 'src/a.ts']),
    ['src/', '  lib/', '    a.ts', '  a.ts', '  b.ts', 'README.md'].join('\n')
  );
});

test('measure returns the growth of the rendered tree without changing it', () => {
  const tree = createTreeAccumulator();
  const names = ['src/a.ts', 'src/lib/ñ.ts', 'src/lib/b.ts', 'docs/x.md'];

  let previous = 0;

  for (const name of names) {
    const growth = tree.measure(name);

    assert.equal(tree.measure(name), growth);

    tree.add(name);

    const now = Buffer.byteLength(tree.render());

    assert.equal(now - previous, growth);

    previous = now;
  }

  assert.equal(tree.measure('src/a.ts'), 0);
});

test('an empty accumulator renders nothing', () => {
  const tree = createTreeAccumulator();

  assert.equal(tree.isEmpty(), true);
  assert.equal(tree.render(), '');

  tree.add('a.ts');

  assert.equal(tree.isEmpty(), false);
});

test('XML puts the tree before the changes and the files', () => {
  const output = renderPrompt(OutputFormat.Xml, {
    systemMessage: 'Be brief',
    tree: 'src/\n  a.ts',
    changes: [
      { repo: 'api', path: 'src/a.ts', status: 'MODIFIED', diff: '+x' }
    ],
    files: [{ name: 'src/a.ts', content: 'x' }]
  });

  assert.equal(
    output,
    '<files><systemMessage><![CDATA[Be brief]]></systemMessage>' +
      '<tree><![CDATA[src/\n  a.ts]]></tree>' +
      '<changes repo="api"><change path="src/a.ts" status="modified"><![CDATA[+x]]></change></changes>' +
      '<file name="src/a.ts"><![CDATA[x]]></file></files>'
  );
});

test('Markdown adds a Structure section with a text block', () => {
  const output = renderPrompt(OutputFormat.Markdown, {
    tree: 'src/\n  a.ts',
    files: [{ name: 'src/a.ts', content: 'x' }]
  });

  assert.equal(
    output,
    '## Structure\n\n```text\nsrc/\n  a.ts\n```\n\n### src/a.ts\n```ts\nx\n```'
  );
});

test('plain text adds a TREE block', () => {
  const output = renderPrompt(OutputFormat.Plain, {
    systemMessage: 'Be brief',
    tree: 'src/\n  a.ts',
    files: [{ name: 'src/a.ts', content: 'x' }]
  });

  assert.equal(
    output,
    'Be brief\n\n=== TREE ===\nsrc/\n  a.ts\n\n=== FILE src/a.ts ===\nx'
  );
});

test('the built prompt counts the tree in its byte length in every format', async () => {
  const root = workspaceWith({
    'src/a.ts': 'const a = 1;',
    'src/lib/b.ts': 'ñandú',
    'c.md': '# c'
  });

  const filePaths = pathsOf(root, ['src/a.ts', 'src/lib/b.ts', 'c.md']);

  for (const format of Object.values(OutputFormat)) {
    const result = await repositoryFor(root, {}, format, 'System').build({
      filePaths
    });

    assert.equal(result.byteLength, Buffer.byteLength(result.output), format);
    assert.ok(result.output.includes('lib/'), format);
    assert.ok(result.output.includes('  b.ts'), format);
  }
});

test('a file cut by maxTotalBytes is not listed in the tree', async () => {
  const root = workspaceWith({
    'a.ts': 'a',
    'big.ts': 'x'.repeat(2000)
  });

  const filePaths = pathsOf(root, ['a.ts', 'big.ts']);
  const result = await repositoryFor(root, { maxTotalBytes: 400 }).build({
    filePaths
  });

  assert.equal(result.stop, 'total-bytes');
  assert.deepEqual(
    result.included.map(file => file.name),
    ['a.ts']
  );

  assert.match(result.output, /<tree><!\[CDATA\[a\.ts\]\]><\/tree>/);
  assert.equal(result.output.includes('big.ts'), false);

  assert.ok(result.byteLength <= 400);
});

test('the tree itself counts toward maxTotalBytes', async () => {
  const root = workspaceWith({ 'a.ts': 'a' });
  const filePaths = pathsOf(root, ['a.ts']);

  const withTree = await repositoryFor(root).build({ filePaths });

  const without = await repositoryFor(root, { includeTree: false }).build({
    filePaths
  });

  assert.ok(withTree.byteLength > without.byteLength);

  const tight = await repositoryFor(root, {
    maxTotalBytes: without.byteLength
  }).build({ filePaths });

  assert.equal(tight.stop, 'total-bytes');
  assert.equal(tight.included.length, 0);
});

test('includeTree off leaves the prompt without a tree', async () => {
  const root = workspaceWith({ 'src/a.ts': 'a' });
  const result = await repositoryFor(root, { includeTree: false }).build({
    filePaths: pathsOf(root, ['src/a.ts'])
  });

  assert.equal(result.output.includes('<tree>'), false);
  assert.equal(result.byteLength, Buffer.byteLength(result.output));
});
