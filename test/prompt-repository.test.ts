import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { OutputFormat } from '../src/domain/entities/output-format.enum';

import { repositoryFor } from './support/prompt-repository';

const temporaryFolder = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-repository-'));

const writeFiles = (workspace: string, names: string[]) =>
  names.map(name => {
    const filePath = path.join(workspace, name);

    fs.writeFileSync(filePath, name);

    return filePath;
  });

test('omits a file reached through a link that leaves the workspace', async () => {
  const outside = temporaryFolder();
  const workspace = temporaryFolder();
  const inside = path.join(workspace, 'real.txt');
  const link = path.join(workspace, 'ext');

  fs.writeFileSync(inside, 'kept');
  fs.writeFileSync(path.join(outside, 'id_rsa'), 'PRIVATE KEY');
  fs.symlinkSync(outside, link, 'junction');

  const result = await repositoryFor(workspace).build({
    filePaths: [inside, path.join(link, 'id_rsa')]
  });

  assert.deepEqual(
    result.included.map(file => file.name),
    ['real.txt']
  );
  assert.equal(result.output.includes('PRIVATE KEY'), false);
  assert.deepEqual(
    result.omittedFiles.map(file => [file.path, file.reason]),
    [['ext/id_rsa', 'symlink']]
  );
});

test('keeps a file reached through a link that stays in the workspace', async () => {
  const workspace = temporaryFolder();
  const target = path.join(workspace, 'packages');
  const link = path.join(workspace, 'alias');

  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'a.txt'), 'inside');
  fs.symlinkSync(target, link, 'junction');

  const result = await repositoryFor(workspace).build({
    filePaths: [path.join(link, 'a.txt')]
  });

  assert.deepEqual(
    result.included.map(file => file.name),
    ['alias/a.txt']
  );
});

test('skips a file over the byte cap without reading it into the prompt', async () => {
  const workspace = temporaryFolder();
  const [huge] = writeFiles(workspace, ['huge.txt']);

  fs.writeFileSync(huge, 'x'.repeat(20));

  const result = await repositoryFor(workspace, { maxFileBytes: 8 }).build({
    filePaths: [huge]
  });

  assert.equal(result.omittedFiles[0]?.reason, 'file-size');
  assert.equal(result.included.length, 0);
});

test('treats a NUL sample as binary', async () => {
  const workspace = temporaryFolder();
  const filePath = path.join(workspace, 'data.bin');

  fs.writeFileSync(filePath, Buffer.from([0x61, 0x00, 0x62]));

  const result = await repositoryFor(workspace).build({
    filePaths: [filePath]
  });

  assert.equal(result.omittedFiles[0]?.reason, 'binary');
});

test('cancel returns no payload', async () => {
  const workspace = temporaryFolder();
  const files = writeFiles(workspace, ['a.ts']);

  const result = await repositoryFor(workspace).build({
    filePaths: files,
    isCancelled: () => true
  });

  assert.equal(result.stop, 'user-cancelled');
  assert.equal(result.output, '');
});

test('cancel during the build does not keep later files', async () => {
  const workspace = temporaryFolder();
  const files = writeFiles(workspace, ['a.ts', 'b.ts', 'c.ts']);
  let checks = 0;

  const result = await repositoryFor(workspace).build({
    filePaths: files,
    isCancelled: () => checks++ > 0
  });

  assert.equal(result.stop, 'user-cancelled');
  assert.equal(result.output, '');
  assert.deepEqual(
    result.included.map(file => file.name),
    ['a.ts']
  );
});

test('file budget reports pending work when nothing else was excluded', async () => {
  const workspace = temporaryFolder();
  const files = writeFiles(workspace, ['a.ts', 'b.ts', 'c.ts']);

  const result = await repositoryFor(workspace, { maxFiles: 1 }).build({
    filePaths: files
  });

  assert.equal(result.stop, 'file-budget');
  assert.equal(result.omittedFiles.length, 0);
  assert.equal(result.included.length, 1);
  assert.equal(result.pending, 2);
  assert.equal(result.byteLength, Buffer.byteLength(result.output));
});

test('the total byte cap stops the build before the file that would not fit', async () => {
  const workspace = temporaryFolder();
  const files = writeFiles(workspace, ['a.ts', 'b.ts']);

  fs.writeFileSync(files[1], 'y'.repeat(500));

  const result = await repositoryFor(workspace, {
    maxTotalBytes: 300
  }).build({ filePaths: files });

  assert.equal(result.stop, 'total-bytes');
  assert.deepEqual(
    result.included.map(file => file.name),
    ['a.ts']
  );
  assert.ok(result.byteLength <= 300);
  assert.equal(result.pending, 1);
});

for (const format of Object.values(OutputFormat)) {
  test(`the reported size matches the ${format} output byte for byte`, async () => {
    const workspace = temporaryFolder();
    const files = writeFiles(workspace, ['a.ts', 'español.md', 'c d.txt']);

    fs.writeFileSync(files[1], '# Guía\nacción con acentuación ñ 🙂\n');

    const result = await repositoryFor(workspace, {}, format).build({
      filePaths: files
    });

    assert.equal(result.included.length, 3);
    assert.equal(result.byteLength, Buffer.byteLength(result.output));
  });
}
