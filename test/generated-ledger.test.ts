import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'path';

import { createGeneratedLedger } from '../src/domain/services/generated-ledger.service';

const root = path.resolve('/workspace');
const at = (...segments: string[]) => path.join(root, ...segments);

const viewWith = (checked: string[]) => ({
  isChecked: (filePath: string) => checked.includes(filePath),
  isFolderChecked: (folderPath: string) => checked.includes(folderPath),
  isStillGenerated: () => true
});

test('a folder that is marked, then unmarked, no longer reports its lockfile', () => {
  const ledger = createGeneratedLedger(root);

  ledger.recordFromFolder([at('web', 'yarn.lock')]);

  assert.deepEqual(ledger.skipped(viewWith([at('web')])), ['web/yarn.lock']);

  ledger.forgetInside(at('web'));

  assert.deepEqual(ledger.skipped(viewWith([at('web')])), []);
});

test('unmarking one folder keeps the lockfiles of another', () => {
  const ledger = createGeneratedLedger(root);

  ledger.recordFromFolder([at('web', 'yarn.lock'), at('api', 'composer.lock')]);
  ledger.forgetInside(at('web'));

  assert.deepEqual(ledger.skipped(viewWith([at('web'), at('api')])), [
    'api/composer.lock'
  ]);
});

test('a lockfile from a folder disappears when no folder above it is checked', () => {
  const ledger = createGeneratedLedger(root);

  ledger.recordFromFolder([at('web', 'yarn.lock')]);

  assert.deepEqual(ledger.skipped(viewWith([])), []);
  assert.deepEqual(ledger.skipped(viewWith([root])), ['web/yarn.lock']);
});

test('a lockfile checked on its own is no longer reported', () => {
  const ledger = createGeneratedLedger(root);
  const lock = at('web', 'yarn.lock');

  ledger.recordFromFolder([lock]);

  assert.deepEqual(ledger.skipped(viewWith([at('web'), lock])), []);
});

test('listed files stay reported without a checked folder, until cleared', () => {
  const ledger = createGeneratedLedger(root);

  ledger.recordListed([at('go.sum')]);

  assert.deepEqual(ledger.skipped(viewWith([])), ['go.sum']);

  ledger.clear();

  assert.deepEqual(ledger.skipped(viewWith([])), []);
});

test('a file that is generated no more is dropped', () => {
  const ledger = createGeneratedLedger(root);

  ledger.recordListed([at('go.sum')]);

  assert.deepEqual(
    ledger.skipped({ ...viewWith([]), isStillGenerated: () => false }),
    []
  );
});
