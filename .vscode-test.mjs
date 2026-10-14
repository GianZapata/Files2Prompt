import fs from 'node:fs';

import { defineConfig } from '@vscode/test-cli';

import { workspacePath } from './scripts/make-fixture.mjs';

const { engines } = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const minimumVersion = engines.vscode.replace(/^[^\d]*/, '');

const shared = {
  files: 'out-test/integration/**/*.test.js',
  workspaceFolder: workspacePath,
  launchArgs: ['--disable-workspace-trust'],
  mocha: { ui: 'tdd', timeout: 60000 }
};

export default defineConfig([
  { label: 'stable', version: 'stable', ...shared },
  { label: 'minimum', version: minimumVersion, ...shared }
]);
