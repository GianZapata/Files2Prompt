import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';

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

  assert.ok(parsed);
  assert.equal(parsed?.systemMessage, source.systemMessage);
  assert.deepEqual(parsed?.files, source.files);

  const planned = planPaste(root, parsed?.files ?? [], () => false);

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

test('dirty paste writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-xml-dirty-'));
  const xml = serializePrompt({
    files: [{ name: 'dirty.ts', content: 'next' }]
  });
  const parsed = parsePrompt(xml);
  const planned = planPaste(root, parsed?.files ?? [], () => true);

  assert.equal(planned.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'dirty.ts')), false);
});
