import type { PromptOutputDataSource } from '../src/domain/datasources/prompt-output.datasource';
import type {
  PromptBuild,
  PromptPayload
} from '../src/domain/entities/prompt-payload.entity';
import type {
  PromptRepository,
  PromptRequest
} from '../src/domain/repositories/prompt.repository';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CopyStop } from '../src/domain/entities/copy-stop.enum';
import { createCopyGate } from '../src/domain/services/copy-gate.service';
import {
  DeliverPrompt,
  type CopyGate
} from '../src/domain/use-cases/prompt/deliver-prompt.use-case';

const createFakeGate = (): CopyGate & { inProgress: boolean } => {
  let active = false;

  return {
    tryStart: () => {
      if (active) {
        return false;
      }

      active = true;

      return true;
    },
    finish: () => {
      active = false;
    },
    get inProgress() {
      return active;
    }
  };
};

const createFakeOutput = (): PromptOutputDataSource & { written: string[] } => {
  const written: string[] = [];

  return {
    written,
    write: async (_text: string, _payload?: PromptPayload) => {
      written.push(_text);
    }
  };
};

test('deliver-prompt: returns started false when gate is busy', async () => {
  const gate = createFakeGate();

  gate.tryStart();

  const repo: PromptRepository = {
    build: async () => {
      throw new Error('should not be called');
    }
  };

  const output = createFakeOutput();
  const useCase = new DeliverPrompt(repo, gate);
  const result = await useCase.execute({ filePaths: [] }, output);

  assert.equal(result.started, false);
  assert.equal(result.wrote, false);
  assert.equal(output.written.length, 0);
});

test('deliver-prompt: does not write when user cancels', async () => {
  const gate = createFakeGate();

  const repo: PromptRepository = {
    build: async () =>
      ({
        stop: CopyStop.UserCancelled,
        output: '',
        included: [],
        omittedFiles: [],
        omittedFolders: [],
        pending: 0,
        byteLength: 0
      }) as PromptBuild
  };

  const output = createFakeOutput();
  const useCase = new DeliverPrompt(repo, gate);
  const result = await useCase.execute({ filePaths: [] }, output);

  assert.equal(result.started, true);
  assert.equal(result.wrote, false);
  assert.equal(output.written.length, 0);
  assert.equal(gate.inProgress, false);
});

test('deliver-prompt: does not write when build text is empty', async () => {
  const gate = createFakeGate();

  const repo: PromptRepository = {
    build: async () =>
      ({
        stop: CopyStop.Completed,
        output: '',
        included: [],
        omittedFiles: [],
        omittedFolders: [],
        pending: 0,
        byteLength: 0
      }) as PromptBuild
  };

  const output = createFakeOutput();
  const useCase = new DeliverPrompt(repo, gate);
  const result = await useCase.execute({ filePaths: [] }, output);

  assert.equal(result.started, true);
  assert.equal(result.wrote, false);
  assert.equal(output.written.length, 0);
  assert.equal(gate.inProgress, false);
});

test('deliver-prompt: writes to output on success and releases gate', async () => {
  const gate = createFakeGate();

  const repo: PromptRepository = {
    build: async (_request: PromptRequest) =>
      ({
        stop: CopyStop.Completed,
        output: '<files>test</files>',
        included: [{ name: 'a.ts', content: 'test' }],
        omittedFiles: [],
        omittedFolders: [],
        pending: 0,
        byteLength: 19
      }) as PromptBuild
  };

  const output = createFakeOutput();
  const useCase = new DeliverPrompt(repo, gate);
  const result = await useCase.execute({ filePaths: ['a.ts'] }, output);

  assert.equal(result.started, true);
  assert.equal(result.wrote, true);
  assert.deepEqual(output.written, ['<files>test</files>']);
  assert.equal(gate.inProgress, false);
});

test('deliver-prompt: releases gate even if output write throws', async () => {
  const gate = createFakeGate();

  const repo: PromptRepository = {
    build: async () =>
      ({
        stop: CopyStop.Completed,
        output: '<files>fail</files>',
        included: [{ name: 'a.ts', content: 'fail' }],
        omittedFiles: [],
        omittedFolders: [],
        pending: 0,
        byteLength: 19
      }) as PromptBuild
  };

  const output: PromptOutputDataSource = {
    write: async () => {
      throw new Error('write failed');
    }
  };

  const useCase = new DeliverPrompt(repo, gate);

  await assert.rejects(async () => {
    await useCase.execute({ filePaths: ['a.ts'] }, output);
  }, /write failed/);

  assert.equal(gate.inProgress, false);
});

const completedBuild = (output: string, included = true): PromptBuild => ({
  stop: CopyStop.Completed,
  output,
  included: included ? [{ name: 'a.ts', content: 'a' }] : [],
  omittedFiles: [],
  omittedFolders: [],
  pending: 0,
  byteLength: Buffer.byteLength(output)
});

test('deliver-prompt: a second delivery does not start or write while the first runs', async () => {
  const gate = createCopyGate();
  const output = createFakeOutput();
  let release: () => void = () => undefined;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  const slow = new DeliverPrompt(
    {
      build: async () => {
        await hold;

        return completedBuild('FIRST');
      }
    },
    gate
  );
  const blocked = new DeliverPrompt(
    {
      build: async () => {
        throw new Error('second build must not run');
      }
    },
    gate
  );

  const first = slow.execute({ filePaths: [] }, output);
  const second = await blocked.execute({ filePaths: [] }, output);

  assert.equal(second.started, false);
  assert.equal(output.written.length, 0);

  release();

  const finished = await first;

  assert.equal(finished.wrote, true);
  assert.deepEqual(output.written, ['FIRST']);

  const third = await new DeliverPrompt(
    { build: async () => completedBuild('THIRD') },
    gate
  ).execute({ filePaths: [] }, output);

  assert.equal(third.started, true);
  assert.equal(output.written.at(-1), 'THIRD');
});

test('deliver-prompt: writes when the prompt has only git changes', async () => {
  const output = createFakeOutput();
  const changesOnly = '<files><changes repo="api"></changes></files>';
  const result = await new DeliverPrompt(
    { build: async () => completedBuild(changesOnly, false) },
    createCopyGate()
  ).execute({ filePaths: [] }, output);

  assert.equal(result.wrote, true);
  assert.deepEqual(output.written, [changesOnly]);
});
