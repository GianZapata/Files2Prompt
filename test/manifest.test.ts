import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { readJson, readManifest } from './support/manifest';

const manifest = readManifest();

interface ArraySetting {
  type: string;
  items?: { type: string };
  default: unknown;
}

interface ArraySettingsManifest {
  contributes: {
    configuration: { properties: Record<string, ArraySetting> };
  };
}

interface NamingManifest {
  name: string;
  activationEvents: string[];
  contributes: object;
}

interface ViewEntry {
  id: string;
}

interface CommandEntry {
  command: string;
}

interface SettingsProperties {
  properties: Record<string, SettingShape>;
}

interface IdentifierContributions {
  commands: CommandEntry[];
  views: Record<string, ViewEntry[]>;
  configuration: SettingsProperties;
}

interface IdentifiersManifest {
  contributes: IdentifierContributions;
}

interface UntrustedWorkspaces {
  supported: string;
  description: string;
  restrictedConfigurations: string[];
}

interface CapabilitiesManifest {
  capabilities: { untrustedWorkspaces: UntrustedWorkspaces };
}

test('the extension runs next to the workspace files', () => {
  assert.deepEqual(manifest.extensionKind, ['workspace']);
});

test('no default shortcut is global', () => {
  for (const binding of manifest.contributes.keybindings) {
    assert.match(
      binding.when ?? '',
      /focusedView == 'promptfoldView'/,
      `${binding.command} must only fire inside the Promptfold view`
    );
  }
});

test('copy as file is a command with a title in both languages', () => {
  const command = manifest.contributes.commands.find(
    item => item.command === 'promptfold.copyAsFile'
  );

  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(command?.title, '%promptfold.copyAsFile.title%');
  assert.equal(english['promptfold.copyAsFile.title'], 'Copy as File…');
  assert.equal(spanish['promptfold.copyAsFile.title'], 'Copiar como archivo…');
});

test('copy as file sits in the overflow menu of the view', () => {
  const entry = manifest.contributes.menus['view/title'].find(
    item => item.command === 'promptfold.copyAsFile'
  );

  assert.match(entry?.group ?? '', /^1_overflow@/);
});

test('clear selection is one click away in the view toolbar', () => {
  const entry = manifest.contributes.menus['view/title'].find(
    item => item.command === 'promptfold.clearChecks'
  );

  const command = manifest.contributes.commands.find(
    item => item.command === 'promptfold.clearChecks'
  );

  assert.match(entry?.group ?? '', /^navigation@/);
  assert.equal(entry?.when, 'view == promptfoldView');
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
    '{0} was saved by Promptfold, so it stays out of the prompt.',
    'sensitive · never included',
    'The system message in this prompt comes from the workspace settings, not from your user settings.',
    '{0} looks like a secret (credentials or keys), so it never goes into the prompt.',
    'This selection is about {0} tokens, {1} over the budget of {2}. Change promptfold.tokenBudget, copy anyway, or cancel.',
    'Copy anyway',
    'Do not ask again in this workspace',
    'This preview is about {0} tokens, over the budget of {1}.',
    'generated · left out of bulk selection'
  ];

  for (const key of expected) {
    assert.equal(typeof bundle[key], 'string', `es is missing "${key}"`);
  }
});

test('allowSensitive is a list of patterns that starts empty', () => {
  const properties =
    readJson<ArraySettingsManifest>('package.json').contributes.configuration
      .properties;

  const setting = properties['promptfold.allowSensitive'];

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

  const setting = properties['promptfold.tokenBudget'];
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(setting.type, 'number');
  assert.equal(setting.default, 0);

  assert.equal(typeof english['promptfold.tokenBudget.description'], 'string');

  assert.equal(typeof spanish['promptfold.tokenBudget.description'], 'string');
});

test('generated files stay out of bulk selection unless the setting says so', () => {
  const properties = readJson<{
    contributes: {
      configuration: { properties: Record<string, SettingShape> };
    };
  }>('package.json').contributes.configuration.properties;

  const setting = properties['promptfold.includeGenerated'];
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, false);

  assert.equal(
    typeof english['promptfold.includeGenerated.description'],
    'string'
  );

  assert.equal(
    typeof spanish['promptfold.includeGenerated.description'],
    'string'
  );
});

test('the tree of selected files is on by default and documented', () => {
  const properties = readJson<{
    contributes: {
      configuration: { properties: Record<string, SettingShape> };
    };
  }>('package.json').contributes.configuration.properties;

  const setting = properties['promptfold.includeTree'];
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, true);
  assert.equal(typeof english['promptfold.includeTree.description'], 'string');

  assert.equal(typeof spanish['promptfold.includeTree.description'], 'string');
});

test('whitespace compaction is opt-in and documented', () => {
  const properties = readJson<{
    contributes: {
      configuration: { properties: Record<string, SettingShape> };
    };
  }>('package.json').contributes.configuration.properties;

  const setting = properties['promptfold.compactWhitespace'];
  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, false);

  assert.equal(
    typeof english['promptfold.compactWhitespace.description'],
    'string'
  );

  assert.equal(
    typeof spanish['promptfold.compactWhitespace.description'],
    'string'
  );
});

test('every command sits under the Promptfold category', () => {
  for (const command of manifest.contributes.commands) {
    assert.equal(command.category, 'Promptfold', command.command);
  }
});

test('nothing in the manifest or its translations uses the old prefix', () => {
  const manifest = readJson<NamingManifest>('package.json');

  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');
  const bundle = readJson<Record<string, string>>('l10n/bundle.l10n.es.json');
  const oldPrefix = /files2prompt/i;

  assert.equal(manifest.name, 'promptfold');
  assert.equal(oldPrefix.test(JSON.stringify(manifest.contributes)), false);
  assert.equal(
    oldPrefix.test(JSON.stringify(manifest.activationEvents)),
    false
  );

  for (const table of [english, spanish, bundle]) {
    assert.equal(oldPrefix.test(JSON.stringify(table)), false);
  }
});

test('commands, views and settings all use the promptfold prefix', () => {
  const manifest = readJson<IdentifiersManifest>('package.json');

  const ids = [
    ...manifest.contributes.commands.map(item => item.command),
    ...Object.values(manifest.contributes.views).flatMap(views =>
      views.map(view => view.id)
    ),
    ...Object.keys(manifest.contributes.configuration.properties)
  ];

  for (const id of ids) {
    assert.match(id, /^promptfold/, id);
  }
});

test('the workspace cannot choose the system message in an untrusted folder', () => {
  const capabilities =
    readJson<CapabilitiesManifest>('package.json').capabilities
      .untrustedWorkspaces;

  const english = readJson<Record<string, string>>('package.nls.json');
  const spanish = readJson<Record<string, string>>('package.nls.es.json');

  assert.equal(capabilities.supported, 'limited');
  assert.deepEqual(capabilities.restrictedConfigurations, [
    'promptfold.systemMessage',
    'promptfold.allowSensitive'
  ]);

  assert.equal(
    capabilities.description,
    '%promptfold.untrustedWorkspaces.description%'
  );

  assert.equal(
    typeof english['promptfold.untrustedWorkspaces.description'],
    'string'
  );

  assert.equal(
    typeof spanish['promptfold.untrustedWorkspaces.description'],
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
