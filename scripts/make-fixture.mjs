import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const fixtures = path.join(repoRoot, 'test-fixtures');

export const workspacePath = path.join(fixtures, 'workspace');
export const externalPath = path.join(fixtures, 'external');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

const write = (root, relativePath, content) => {
  const filePath = path.join(root, relativePath);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const initRepository = name => {
  const repository = path.join(workspacePath, name);

  fs.mkdirSync(repository, { recursive: true });
  git(repository, 'init', '--quiet', '--initial-branch=main');
  git(repository, 'config', '--local', 'user.name', 'Files2Prompt Tests');
  git(
    repository,
    'config',
    '--local',
    'user.email',
    'tests@files2prompt.invalid'
  );
  git(repository, 'config', '--local', 'commit.gpgsign', 'false');
  git(repository, 'config', '--local', 'core.autocrlf', 'false');

  return repository;
};

const commitAll = repository => {
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'initial');
};

const createApi = () => {
  const api = initRepository('api');

  write(api, 'src/index.ts', 'export const version = 1;\n');
  commitAll(api);

  write(api, 'src/index.ts', 'export const version = 2;\n');
  write(api, 'src/staged.ts', 'export const staged = true;\n');
  git(api, 'add', 'src/index.ts', 'src/staged.ts');
  write(api, 'src/index.ts', 'export const version = 3;\n');
  write(api, '.env', 'API_TOKEN=super-secret-token\n');
  write(api, 'certs/server.pem', 'PEM PRIVATE MATERIAL\n');
};

const createWeb = () => {
  const web = initRepository('web');

  write(web, 'docs/mi archivo.md', '# Guía\n\nPrimera versión.\n');
  write(web, 'español.md', '# Español\n\nTexto original.\n');
  write(web, 'src/app.ts', "export const app = 'web';\n");
  commitAll(web);

  write(web, 'docs/mi archivo.md', '# Guía\n\nSegunda versión con acción.\n');
  write(web, 'español.md', '# Español\n\nTexto con acentuación.\n');
  git(web, 'add', 'español.md');
  write(web, 'notas rápidas.txt', 'Revisar el diseño.\n');
};

const createExternalLink = () => {
  write(externalPath, 'id_rsa', 'PRIVATE KEY MATERIAL\n');

  fs.symlinkSync(
    externalPath,
    path.join(workspacePath, 'ext'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
};

export const makeFixture = () => {
  fs.rmSync(fixtures, { recursive: true, force: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  write(
    workspacePath,
    '.vscode/settings.json',
    `${JSON.stringify({ 'git.openRepositoryInParentFolders': 'never' }, null, 2)}\n`
  );

  createApi();
  createWeb();
  createExternalLink();

  return workspacePath;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  makeFixture();
}
