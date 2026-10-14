import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { readJson, readManifest } from './support/manifest';

const manifest = readManifest();

test('the extension runs next to the workspace files', () => {
  assert.deepEqual(manifest.extensionKind, ['workspace']);
});

test('no default shortcut is global', () => {
  for (const binding of manifest.contributes.keybindings) {
    assert.match(
      binding.when ?? '',
      /focusedView == 'files2PromptView'/,
      `${binding.command} must only fire inside the Files2Prompt view`
    );
  }
});

test('copy as file is a command with a title in both languages', () => {
  const command = manifest.contributes.commands.find(
    item => item.command === 'files2prompt.copyAsFile'
  );

  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(command?.title, '%files2prompt.copyAsFile.title%');
  assert.equal(english['files2prompt.copyAsFile.title'], 'Copy as File…');
  assert.equal(
    spanish['files2prompt.copyAsFile.title'],
    'Copiar como archivo…'
  );
});

test('copy as file sits in the overflow menu of the view', () => {
  const entry = manifest.contributes.menus['view/title'].find(
    item => item.command === 'files2prompt.copyAsFile'
  );

  assert.match(entry?.group ?? '', /^1_overflow@/);
});

test('clear selection is one click away in the view toolbar', () => {
  const entry = manifest.contributes.menus['view/title'].find(
    item => item.command === 'files2prompt.clearChecks'
  );
  const command = manifest.contributes.commands.find(
    item => item.command === 'files2prompt.clearChecks'
  );

  assert.match(entry?.group ?? '', /^navigation@/);
  assert.equal(entry?.when, 'view == files2PromptView');
  assert.ok(command?.icon, 'the toolbar needs an icon');
});

test('every nls key used by the manifest exists in both languages', () => {
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');
  const used = [
    ...fs
      .readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
      .matchAll(/"%([^%"]+)%"/g)
  ].map(match => match[1]);

  for (const key of used) {
    assert.equal(typeof english[key], 'string', `en is missing ${key}`);
    assert.equal(typeof spanish[key], 'string', `es is missing ${key}`);
  }
});

test('new user-facing strings have a Spanish translation', () => {
  const bundle = readJson<Record<string, string>>('l10n/bundle.l10n.es.json');
  const expected = [
    'Open',
    'Reveal in Finder',
    'Reveal in File Explorer',
    'Reveal in file manager',
    '{0} was saved by Files2Prompt, so it stays out of the prompt.',
    'sensitive · never included',
    'The system message in this prompt comes from the workspace settings, not from your user settings.',
    '{0} looks like a secret (credentials or keys), so it never goes into the prompt.',
    'This selection is about {0} tokens, {1} over the budget of {2}. Change files2prompt.tokenBudget, copy anyway, or cancel.',
    'Copy anyway',
    'Do not ask again in this workspace',
    'This preview is about {0} tokens, over the budget of {1}.'
  ];

  for (const key of expected) {
    assert.equal(typeof bundle[key], 'string', `es is missing "${key}"`);
  }
});

test('allowSensitive is a list of patterns that starts empty', () => {
  const properties = readJson<{
    contributes: {
      configuration: {
        properties: Record<
          string,
          { type: string; items?: { type: string }; default: unknown }
        >;
      };
    };
  }>('package.json').contributes.configuration.properties;
  const setting = properties['files2prompt.allowSensitive'];

  assert.equal(setting.type, 'array');
  assert.equal(setting.items?.type, 'string');
  assert.deepEqual(setting.default, []);
});

interface SettingShape {
  type: string;
  default: unknown;
}

test('the token budget is off by default and described in both languages', () => {
  const properties = readJson<{
    contributes: {
      configuration: { properties: Record<string, SettingShape> };
    };
  }>('package.json').contributes.configuration.properties;

  const setting = properties['files2prompt.tokenBudget'];
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(setting.type, 'number');
  assert.equal(setting.default, 0);

  assert.equal(
    typeof english['files2prompt.tokenBudget.description'],
    'string'
  );

  assert.equal(
    typeof spanish['files2prompt.tokenBudget.description'],
    'string'
  );
});

test('the workspace cannot choose the system message in an untrusted folder', () => {
  const capabilities = readJson<{
    capabilities: {
      untrustedWorkspaces: {
        supported: string;
        description: string;
        restrictedConfigurations: string[];
      };
    };
  }>('package.json').capabilities.untrustedWorkspaces;
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(capabilities.supported, 'limited');
  assert.deepEqual(capabilities.restrictedConfigurations, [
    'files2prompt.systemMessage',
    'files2prompt.allowSensitive'
  ]);
  assert.equal(
    capabilities.description,
    '%files2prompt.untrustedWorkspaces.description%'
  );
  assert.equal(
    typeof english['files2prompt.untrustedWorkspaces.description'],
    'string'
  );
  assert.equal(
    typeof spanish['files2prompt.untrustedWorkspaces.description'],
    'string'
  );
});

test('the package ships only the dependency it uses', () => {
  const { dependencies } = readJson<{ dependencies: Record<string, string> }>(
    'package.json'
  );
  const ignored = fs.readFileSync(
    path.join(__dirname, '../../.vscodeignore'),
    'utf8'
  );

  assert.deepEqual(Object.keys(dependencies), ['ignore']);
  assert.equal(ignored.includes('fast-xml-parser'), false);
});

test('the test workflow also runs on pushes to integration branches', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '../../.github/workflows/test.yml'),
    'utf8'
  );

  assert.match(workflow, /branches: \[main, 'integration\/\*\*'\]/);
});
