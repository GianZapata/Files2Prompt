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
    '{0} was saved by Files2Prompt, so it stays out of the prompt.'
  ];

  for (const key of expected) {
    assert.equal(typeof bundle[key], 'string', `es is missing "${key}"`);
  }
});
