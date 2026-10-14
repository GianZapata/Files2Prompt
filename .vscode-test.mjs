import { defineConfig } from '@vscode/test-cli';

import { createFixture } from './scripts/create-fixture.mjs';

export default defineConfig({
  files: 'out-integration/test-integration/**/*.test.js',
  workspaceFolder: createFixture(),
  launchArgs: ['--disable-workspace-trust'],
  mocha: { ui: 'bdd', timeout: 60000 }
});
