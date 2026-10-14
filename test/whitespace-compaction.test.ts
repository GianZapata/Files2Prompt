import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { compactWhitespace } from '../src/domain/services/whitespace-compaction.service';

import { repositoryFor } from './support/prompt-repository';

test('line endings become LF and trailing spaces disappear', () => {
  assert.equal(
    compactWhitespace('one  \r\ntwo\t\r\n   \r\nthree'),
    'one\ntwo\n\nthree'
  );
});

test('two or more blank lines shrink to one, a single one stays', () => {
  assert.equal(compactWhitespace('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(compactWhitespace('a\n\n\nb'), 'a\n\nb');
  assert.equal(compactWhitespace('a\n\nb'), 'a\n\nb');
});

test('leading indentation survives', () => {
  const python = 'def f():\n    if x:\n\treturn 1  \n        return 2\n';

  assert.equal(
    compactWhitespace(python),
    'def f():\n    if x:\n\treturn 1\n        return 2\n'
  );
});

test('blank lines inside a block of YAML keep their indentation context', () => {
  const yaml = 'a:\n  b: 1\n\n\n\n\n  c: 2\n';

  assert.equal(compactWhitespace(yaml), 'a:\n  b: 1\n\n  c: 2\n');
});

const workspaceWithFile = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-compact-'));
  const file = path.join(root, 'a.py');

  fs.writeFileSync(file, 'x = 1   \r\n\r\n\r\n\r\n\r\n    y = 2\r\n');

  return { root, file };
};

test('the setting compacts file content but not diffs', async () => {
  const { root, file } = workspaceWithFile();
  const diff = '@@ -1 +1 @@\r\n-a  \r\n+b  \r\n\r\n\r\n\r\n\r\n';

  const result = await repositoryFor(root, { compactWhitespace: true }).build({
    filePaths: [file],
    changes: [{ repo: 'api', path: 'a.py', status: 'MODIFIED', diff }]
  });

  assert.equal(result.included[0].content, 'x = 1\n\n    y = 2\n');
  assert.ok(result.output.includes(diff));
});

test('without the setting the content is left exactly as read', async () => {
  const { root, file } = workspaceWithFile();

  const result = await repositoryFor(root).build({ filePaths: [file] });

  assert.equal(
    result.included[0].content,
    'x = 1   \r\n\r\n\r\n\r\n\r\n    y = 2\r\n'
  );
});

test('compaction frees bytes for the size limit', async () => {
  const { root, file } = workspaceWithFile();

  const plain = await repositoryFor(root).build({ filePaths: [file] });

  const compact = await repositoryFor(root, { compactWhitespace: true }).build({
    filePaths: [file]
  });

  assert.ok(compact.byteLength < plain.byteLength);
});
