import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { OutputFormat } from '../src/domain/entities/output-format.enum';
import {
  copyStatusMessage,
  previewStatusMessage,
  saveStatusMessage
} from '../src/presentation/messages/user-messages';
import {
  createDetailsSource,
  createPreviewSource
} from '../src/presentation/views/prompt-preview.source';

import { readManifest } from './support/manifest';

test('copy notices do not show internal stop codes', () => {
  const copy = copyStatusMessage({
    stop: 'file-budget',
    included: 1,
    omittedFiles: 0,
    omittedFolders: 0,
    pending: 4
  });

  assert.equal(copy.message.includes('file-budget'), false);
  assert.match(copy.message, /file limit/);
});

test('save notices do not show internal stop codes and mention file name', () => {
  const save = saveStatusMessage({
    stop: 'completed',
    included: 3,
    omittedFiles: 1,
    omittedFolders: 0,
    pending: 0,
    fileName: 'prompt.md'
  });

  assert.equal(save.message.includes('completed'), false);
  assert.deepEqual(save.args, [3, 'prompt.md', 1, 0]);
});

test('a partial preview says how many files were left out', () => {
  const notice = previewStatusMessage({
    stop: 'total-bytes',
    included: 1354,
    pending: 562
  });

  assert.equal(notice.message.includes('total-bytes'), false);
  assert.match(notice.message, /\{0\}/);
  assert.match(notice.message, /too large/);
  assert.deepEqual(notice.args, [1354, 562]);
});

test('the view title keeps five codicon actions and a select submenu', () => {
  const manifest = readManifest();

  const title = manifest.contributes.menus['view/title'];
  const navigation = title.filter(item => item.group?.startsWith('navigation'));

  assert.equal(navigation.length, 5);
  assert.deepEqual(
    navigation.map(item => item.command ?? item.submenu),
    [
      'files2prompt.copyFiles',
      'files2prompt.previewPrompt',
      'files2prompt.select',
      'files2prompt.selectChanges',
      'files2prompt.clearChecks'
    ]
  );

  assert.equal(
    manifest.contributes.submenus?.find(
      item => item.id === 'files2prompt.select'
    )?.icon,
    '$(checklist)'
  );

  assert.deepEqual(
    manifest.contributes.menus['files2prompt.select'].map(item => item.command),
    [
      'files2prompt.selectAll',
      'files2prompt.selectByExtension',
      'files2prompt.clearChecks'
    ]
  );

  assert.equal(
    title.some(item => item.submenu === 'files2prompt.copyAs'),
    false
  );

  assert.equal(
    manifest.contributes.submenus?.some(
      item => item.id === 'files2prompt.copyAs'
    ),
    false
  );

  assert.equal(
    navigation.some(item => item.command === 'files2prompt.selectChanges'),
    true
  );

  assert.equal(
    title.some(item => item.command === 'files2prompt.pasteXml'),
    false
  );

  assert.deepEqual(
    title
      .filter(item => item.group?.startsWith('1_overflow'))
      .map(item => item.command),
    [
      'files2prompt.copyOpenFiles',
      'files2prompt.refresh',
      'files2prompt.showDetails',
      'files2prompt.savePromptAs',
      'files2prompt.copyAsFile'
    ]
  );

  assert.equal(
    title.some(
      item =>
        item.command === 'files2prompt.goBack' ||
        item.command === 'files2prompt.goForward'
    ),
    false
  );

  assert.equal(
    manifest.contributes.commands.some(
      item => item.command === 'files2prompt.goBack'
    ),
    true
  );

  assert.equal(
    manifest.contributes.commands.some(
      item => item.command === 'files2prompt.savePromptAs'
    ),
    true
  );

  assert.equal(
    manifest.contributes.commands.some(
      item => item.command === 'files2prompt.changeOutputFormat'
    ),
    true
  );

  assert.equal(
    title.some(item => item.command === 'files2prompt.changeOutputFormat'),
    false
  );

  assert.equal(
    manifest.contributes.commands.some(
      item => item.command === 'files2prompt.copyAsMarkdown'
    ),
    true
  );
});

test('git changes and extensions start collapsed', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  ) as {
    contributes: {
      views: {
        files2prompt: Array<{ id: string; visibility?: string }>;
      };
    };
  };
  const views = manifest.contributes.views.files2prompt;

  assert.equal(
    views.find(view => view.id === 'files2PromptView')?.visibility,
    undefined
  );
  assert.equal(
    views.find(view => view.id === 'files2prompt.gitChanges')?.visibility,
    'collapsed'
  );
  assert.equal(
    views.find(view => view.id === 'files2prompt.extensions')?.visibility,
    'collapsed'
  );
});

test('view shortcuts use the focused view, not a custom active flag', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  ) as { contributes: { keybindings: Array<{ when?: string }> } };

  for (const binding of manifest.contributes.keybindings) {
    assert.equal(
      (binding.when ?? '').includes('files2PromptView.active'),
      false
    );
  }

  assert.equal(
    manifest.contributes.keybindings.some(
      binding => binding.when === "focusedView == 'files2PromptView'"
    ),
    true
  );
});

test('details content is served from a virtual document', () => {
  const details = createDetailsSource();

  details.set('Stop: total-bytes');
  assert.equal(details.uri.startsWith('files2prompt-details:'), true);
  assert.equal(details.get(), 'Stop: total-bytes');
});

test('preview names its virtual document after the output format', () => {
  const preview = createPreviewSource();

  assert.equal(
    preview.uriFor(OutputFormat.Markdown),
    'files2prompt-preview:prompt.md'
  );

  assert.equal(
    preview.uriFor(OutputFormat.Plain),
    'files2prompt-preview:prompt.txt'
  );

  assert.equal(
    preview.uriFor(OutputFormat.Xml),
    'files2prompt-preview:prompt.xml'
  );
});

test('preview keeps the content of each format separate', () => {
  const preview = createPreviewSource();
  const markdown = preview.uriFor(OutputFormat.Markdown);
  const xml = preview.uriFor(OutputFormat.Xml);

  preview.set(markdown, '### a.ts');
  preview.set(xml, '<files></files>');

  assert.equal(preview.get(markdown), '### a.ts');
  assert.equal(preview.get(xml), '<files></files>');
  assert.equal(preview.get(preview.uriFor(OutputFormat.Plain)), '');
});
