import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { WorkspaceFilesDataSource } from '../src/domain/datasources/workspace-files.datasource';
import { DiffMode } from '../src/domain/entities/diff-mode.enum';
import { IgnoreReason } from '../src/domain/entities/ignore-reason.enum';
import { OutputFormat } from '../src/domain/entities/output-format.enum';
import { createIgnoreResolver } from '../src/infrastructure/ignore/ignore-resolver.service';
import { PromptRepositoryImpl } from '../src/infrastructure/repositories/prompt.repository.impl';

const SENSITIVE_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  'api/.env',
  'certs/server.pem',
  'certs/private.key',
  'certs/bundle.p12',
  'certs/bundle.pfx',
  '.ssh/id_rsa',
  '.ssh/id_rsa.pub',
  '.ssh/id_ed25519',
  '.ssh/id_ed25519.pub',
  'auth.json',
  'config/credentials.json',
  'config/credentials-prod.json',
  'android/release.keystore',
  '.npmrc',
  'packages/web/.npmrc',
  '.pypirc'
];

const SAFE_PATHS = [
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.dist',
  'api/.env.example',
  'src/keys.ts',
  'docs/pem-format.md',
  'config/settings.json',
  '.envrc'
];

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-sensitive-'));

test('secrets are excluded with the sensitive reason at any depth', () => {
  const resolver = createIgnoreResolver({ workspaceRoot: makeRoot() });

  for (const secret of SENSITIVE_PATHS) {
    const decision = resolver.resolve(secret, 'file');

    assert.equal(decision.included, false, `${secret} must be excluded`);
    assert.equal(decision.reason, IgnoreReason.Sensitive, secret);
  }
});

test('example env files and look-alike names stay available', () => {
  const resolver = createIgnoreResolver({ workspaceRoot: makeRoot() });

  for (const safe of SAFE_PATHS) {
    assert.equal(resolver.resolve(safe, 'file').included, true, safe);
  }
});

test('explain names the sensitive reason and the matching pattern', () => {
  const resolver = createIgnoreResolver({ workspaceRoot: makeRoot() });
  const decision = resolver.explain('api/.env.production', 'file');

  assert.equal(decision.included, false);
  assert.equal(decision.reason, IgnoreReason.Sensitive);
  assert.equal(decision.pattern, '.env.*');
});

test('the sensitive reason wins over a gitignore rule for the same file', () => {
  const root = makeRoot();

  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');

  const resolver = createIgnoreResolver({ workspaceRoot: root });

  assert.equal(resolver.resolve('.env', 'file').reason, IgnoreReason.Sensitive);
  assert.equal(resolver.explain('.env', 'file').reason, IgnoreReason.Sensitive);
});

test('a forced root never brings a secret back', () => {
  const root = makeRoot();

  fs.writeFileSync(path.join(root, '.gitignore'), 'private/\n');

  const resolver = createIgnoreResolver({
    workspaceRoot: root,
    forcedRoots: [
      { relativePath: 'private', pattern: 'private/', sourceFile: '.gitignore' }
    ]
  });

  assert.equal(resolver.resolve('private/notes.md', 'file').included, true);
  assert.equal(
    resolver.resolve('private/.env', 'file').reason,
    IgnoreReason.Sensitive
  );
  assert.equal(
    resolver.resolve('private/keys/server.pem', 'file').reason,
    IgnoreReason.Sensitive
  );
});

test('allowSensitive lets the user opt specific files back in', () => {
  const resolver = createIgnoreResolver({
    workspaceRoot: makeRoot(),
    allowSensitive: ['.npmrc', 'certs/public.pem']
  });

  assert.equal(resolver.resolve('.npmrc', 'file').included, true);
  assert.equal(resolver.resolve('packages/web/.npmrc', 'file').included, true);
  assert.equal(resolver.resolve('certs/public.pem', 'file').included, true);
  assert.equal(resolver.resolve('certs/server.pem', 'file').included, false);
  assert.equal(resolver.resolve('.env', 'file').included, false);
});

test('folders are not treated as secrets', () => {
  const resolver = createIgnoreResolver({ workspaceRoot: makeRoot() });

  assert.equal(resolver.resolve('keys', 'directory').included, true);
});

class DiskFilesDataSource extends WorkspaceFilesDataSource {
  existsAndIsFile = async (filePath: string) =>
    fs.existsSync(filePath) && fs.lstatSync(filePath).isFile();

  sizeOf = async (filePath: string) => fs.statSync(filePath).size;

  isBinary = async () => false;

  readText = async (filePath: string) => fs.readFileSync(filePath, 'utf8');

  realPathOf = async (filePath: string) => fs.realpathSync(filePath);
}

test('the diff of a secret never reaches the prompt', async () => {
  const workspace = makeRoot();
  const resolver = createIgnoreResolver({ workspaceRoot: workspace });
  const repository = new PromptRepositoryImpl(
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
    { resolvePath: resolver.resolve }
  );

  fs.writeFileSync(path.join(workspace, '.env'), 'TOKEN=abc');

  const result = await repository.build({
    filePaths: [path.join(workspace, '.env')],
    changes: [
      {
        repo: '',
        path: '.env',
        status: 'modified',
        diff: '-TOKEN=old\n+TOKEN=abc'
      },
      {
        repo: '',
        path: 'src/app.ts',
        status: 'modified',
        diff: '+export const app = 1;'
      }
    ]
  });

  assert.equal(result.output.includes('TOKEN='), false);
  assert.equal(result.output.includes('src/app.ts'), true);
  assert.deepEqual(
    result.omittedFiles.map(file => [file.path, file.reason]),
    [['.env', 'sensitive']]
  );
});
