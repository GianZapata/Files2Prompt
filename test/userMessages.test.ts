import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { createPreviewSource } from '../src/promptPreview';
import { copyStatusMessage, pasteStatusMessage } from '../src/userMessages';

test('copy and paste notices do not show internal stop codes', () => {
  const copy = copyStatusMessage({
    stop: 'file-budget',
    included: 1,
    omittedFiles: 0,
    omittedFolders: 0,
    pending: 4
  });
  const paste = pasteStatusMessage('unsaved-conflict');

  assert.equal(copy.message.includes('file-budget'), false);
  assert.equal(paste.message.includes('unsaved-conflict'), false);
  assert.match(copy.message, /file limit/);
  assert.match(paste.message, /unsaved changes/);
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

test('preview content is served from a virtual document', () => {
  const preview = createPreviewSource();

  preview.set('<files></files>');
  assert.equal(preview.uri.startsWith('files2prompt-preview:'), true);
  assert.equal(preview.get(), '<files></files>');
});
