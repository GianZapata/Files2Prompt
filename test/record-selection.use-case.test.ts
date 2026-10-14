import type { StateDataSource } from '../src/domain/datasources/state.datasource';
import type { SelectionSnapshot } from '../src/domain/entities/selection-snapshot.entity';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSelectionHistory } from '../src/domain/services/selection-history.service';
import { RecordSelection } from '../src/domain/use-cases/selection/record-selection.use-case';

test('record-selection: records snapshot, persists state, and triggers notification', async () => {
  const history = createSelectionHistory();
  const state: Record<string, unknown> = {};

  const fakeStateDataSource: StateDataSource = {
    get: <T>(key: string) => state[key] as T,
    update: async <T>(key: string, value: T) => {
      state[key] = value;
    }
  };

  let notified = false;
  const useCase = new RecordSelection(history, fakeStateDataSource, () => {
    notified = true;
  });

  const snapshot: SelectionSnapshot = {
    files: ['src/app.ts'],
    forcedRoots: [],
    promptChanges: []
  };

  await useCase.execute({ snapshot });

  assert.equal(history.position(), 0);
  assert.equal(history.entries().length, 1);
  assert.equal(notified, true);
  assert.deepEqual(state['files2prompt.selectionHistory'], {
    entries: [snapshot],
    position: 0
  });
});
