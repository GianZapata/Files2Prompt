import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from '@vscode/test-electron';

const vsix = path.resolve(process.argv[2] ?? '');
const repoRoot = process.cwd();
const { version } = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);

if (!fs.existsSync(vsix)) {
  throw new Error(`The VSIX was not found: ${vsix}`);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-smoke-'));
const extensionsDir = path.join(temporary, 'extensions');
const userDataDir = path.join(temporary, 'user-data');
const workspace = path.join(temporary, 'workspace');

fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, 'hello.txt'), 'hello\n');

const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
const [cli, ...cliArgs] =
  resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

const install = spawnSync(
  cli,
  [
    ...cliArgs,
    '--extensions-dir',
    extensionsDir,
    '--user-data-dir',
    userDataDir,
    '--install-extension',
    vsix
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (install.status !== 0) {
  throw new Error(`Installing the VSIX failed with status ${install.status}`);
}

await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath: path.join(repoRoot, 'test/smoke/host'),
  extensionTestsPath: path.join(repoRoot, 'out-test/smoke/index.js'),
  extensionTestsEnv: {
    F2P_EXTENSIONS_DIR: extensionsDir,
    F2P_VERSION: version
  },
  launchArgs: [
    workspace,
    '--extensions-dir',
    extensionsDir,
    '--user-data-dir',
    userDataDir,
    '--disable-workspace-trust'
  ]
});

fs.rmSync(temporary, { recursive: true, force: true });
