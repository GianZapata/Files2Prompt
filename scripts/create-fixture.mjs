import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const identity = {
  GIT_AUTHOR_NAME: 'Files2Prompt Tests',
  GIT_AUTHOR_EMAIL: 'tests@files2prompt.invalid',
  GIT_COMMITTER_NAME: 'Files2Prompt Tests',
  GIT_COMMITTER_EMAIL: 'tests@files2prompt.invalid'
};

const git = (cwd, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'init.defaultBranch=main',
      ...args
    ],
    { cwd, env: { ...process.env, ...identity }, stdio: 'pipe' }
  );

const write = (root, relativePath, content) => {
  const filePath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createRepository = (root, name, committed, changed, untracked) => {
  const repository = path.join(root, name);

  fs.mkdirSync(repository, { recursive: true });
  git(repository, 'init', '--quiet');

  for (const [relativePath, content] of Object.entries(committed)) {
    write(repository, relativePath, content);
  }

  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'initial');

  for (const [relativePath, content] of Object.entries(changed)) {
    write(repository, relativePath, content);
  }

  for (const [relativePath, content] of Object.entries(untracked)) {
    write(repository, relativePath, content);
  }
};

export const createFixture = () => {
  const base = path.join(
    fs.realpathSync.native(os.tmpdir()),
    'files2prompt-integration'
  );
  const workspace = path.join(base, 'workspace');

  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });

  createRepository(
    workspace,
    'api',
    { 'src/index.ts': 'export const version = 1;\n' },
    { 'src/index.ts': 'export const version = 2;\n' },
    {}
  );

  createRepository(
    workspace,
    'web',
    {
      'docs/guía de uso.md': '# Guía\n\nPrimera versión.\n',
      'src/app.ts': "export const app = 'web';\n"
    },
    { 'docs/guía de uso.md': '# Guía\n\nSegunda versión con acción.\n' },
    { 'notas rápidas.txt': 'Revisar el diseño.\n' }
  );

  return workspace;
};
