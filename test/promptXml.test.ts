import fs from 'fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'os';
import path from 'path';

import { planPaste } from '../src/pastePlan';
import { parsePrompt, serializePrompt } from '../src/promptXml';

test('copy then paste keeps names, cdata, and system message', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-xml-'));
  const source = {
    systemMessage: 'keep ]]> this',
    files: [
      { name: 'src/app.ts', content: 'export const value = 1;' },
      { name: 'a&b.ts', content: 'has ]]> inside' }
    ]
  };
  const xml = serializePrompt(source);
  const parsed = parsePrompt(xml);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.payload.systemMessage, source.systemMessage);
  assert.deepEqual(parsed.payload.files, source.files);

  const planned = planPaste(root, parsed.payload.files, () => false);

  assert.equal(planned.ok, true);
  if (planned.ok) {
    for (const write of planned.writes) {
      fs.mkdirSync(path.dirname(write.absolutePath), { recursive: true });
      fs.writeFileSync(write.absolutePath, write.content);
    }
  }

  assert.equal(
    fs.readFileSync(path.join(root, 'a&b.ts'), 'utf8'),
    'has ]]> inside'
  );
});

test('rejects file content that is not entirely cdata', () => {
  const tsx = parsePrompt(
    '<files><file name="src/App.tsx"><div>hi</div></file></files>'
  );
  const empty = parsePrompt('<files><file name="x"/></files>');
  const text = parsePrompt('<files><file name="src/a.ts">plain</file></files>');

  assert.equal(tsx.ok, false);
  assert.equal(empty.ok, false);
  assert.equal(text.ok, false);
  if (!tsx.ok) {
    assert.equal(tsx.reason, 'missing-cdata');
    assert.deepEqual(tsx.paths, ['src/App.tsx']);
  }
});

test('dirty paste writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-xml-dirty-'));
  const xml = serializePrompt({
    files: [{ name: 'dirty.ts', content: 'next' }]
  });
  const parsed = parsePrompt(xml);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const planned = planPaste(root, parsed.payload.files, () => true);

  assert.equal(planned.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'dirty.ts')), false);
});
