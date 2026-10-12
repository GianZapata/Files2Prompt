import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { createDetailsSource, createPreviewSource } from '../src/promptPreview';
import { copyStatusMessage, previewStatusMessage } from '../src/userMessages';

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

test('the view title keeps four codicon actions and a select submenu', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  ) as {
    contributes: {
      commands: Array<{ command: string; icon?: string | { light?: string } }>;
      submenus?: Array<{ id: string; icon?: string }>;
      menus: {
        'view/title': Array<{
          command?: string;
          submenu?: string;
          group?: string;
        }>;
        [key: string]: Array<{ command?: string; group?: string }>;
      };
    };
  };
  const title = manifest.contributes.menus['view/title'];
  const navigation = title.filter(item => item.group?.startsWith('navigation'));

  assert.equal(navigation.length, 4);
  assert.deepEqual(
    navigation.map(item => item.command ?? item.submenu),
    [
      'files2prompt.copyFiles',
      'files2prompt.previewPrompt',
      'files2prompt.select',
      'files2prompt.selectChanges'
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

test('preview content is served from a virtual document', () => {
  const preview = createPreviewSource();

  preview.set('<files></files>');
  assert.equal(preview.uri.startsWith('files2prompt-preview:'), true);
  assert.equal(preview.get(), '<files></files>');
});
