import type { PromptBuild } from '../src/domain/entities/prompt-payload.entity';
import type {
  PromptRepository,
  PromptRequest
} from '../src/domain/repositories/prompt.repository';

import assert from 'node:assert/strict';
import test from 'node:test';

import { CopyStop } from '../src/domain/entities/copy-stop.enum';
import { GeneratePrompt } from '../src/domain/use-cases/prompt/generate-prompt.use-case';

test('generate-prompt: delegates to repository without side effects', async () => {
  let calledWith: PromptRequest | undefined;
  const expected: PromptBuild = {
    stop: CopyStop.Completed,
    xml: '<files><file name="x">hi</file></files>',
    included: [{ name: 'x', content: 'hi' }],
    omittedFiles: [],
    omittedFolders: [],
    pending: 0,
    byteLength: 39
  };

  const repo: PromptRepository = {
    build: async (request: PromptRequest) => {
      calledWith = request;

      return expected;
    }
  };

  const useCase = new GeneratePrompt(repo);
  const result = await useCase.execute({ filePaths: ['x'] });

  assert.deepEqual(result, expected);
  assert.deepEqual(calledWith, { filePaths: ['x'] });
});
