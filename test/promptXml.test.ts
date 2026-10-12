import assert from 'node:assert/strict';
import test from 'node:test';

import { serializePrompt } from '../src/promptXml';

test('serialized xml keeps names, cdata, and the system message', () => {
  const xml = serializePrompt({
    systemMessage: 'keep ]]> this',
    files: [
      { name: 'src/app.ts', content: 'export const value = 1;' },
      { name: 'a&b.ts', content: 'has ]]> inside' }
    ]
  });

  assert.match(xml, /name="src\/app.ts"/);
  assert.match(xml, /name="a&amp;b.ts"/);
  assert.equal(xml.includes('keep ]]]]><![CDATA[> this'), true);
  assert.match(xml, /<systemMessage>/);
});
