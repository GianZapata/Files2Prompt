import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { WorkspaceFilesDataSource } from '../src/domain/datasources/workspace-files.datasource';
import { DiffMode } from '../src/domain/entities/diff-mode.enum';
import { OutputFormat } from '../src/domain/entities/output-format.enum';
import { PromptRepositoryImpl } from '../src/infrastructure/repositories/prompt.repository.impl';

class DiskFilesDataSource extends WorkspaceFilesDataSource {
  existsAndIsFile = async (filePath: string) =>
    fs.existsSync(filePath) && fs.lstatSync(filePath).isFile();

  sizeOf = async (filePath: string) => fs.statSync(filePath).size;

  isBinary = async () => false;

  readText = async (filePath: string) => fs.readFileSync(filePath, 'utf8');

  realPathOf = async (filePath: string) => fs.realpathSync(filePath);
}

const temporaryFolder = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-repository-'));

const repositoryFor = (workspace: string) =>
  new PromptRepositoryImpl(
    workspace,
    new DiskFilesDataSource(),
    {
      promptSettings: () => ({
        outputFormat: OutputFormat.Xml,
        diffMode: DiffMode.DiffAndFiles,
        maxFileBytes: 1048576,
        maxTotalBytes: 8388608,
        maxFiles: 5000
      })
    },
    { resolvePath: () => ({ included: true }) }
  );

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
