import type { PromptBuild } from '../entities/prompt-payload.entity';

import { createCopyGate } from './copy-gate.service';

export interface ClipboardPort {
  write: (text: string) => PromiseLike<void> | void;
}

export interface CopyRun {
  started: boolean;
  wrote: boolean;
  summary?: PromptBuild;
}

export interface CopyRunInput {
  gate: ReturnType<typeof createCopyGate>;
  clipboard: ClipboardPort;
  summarize: (built: PromptBuild) => PromptBuild;
  build: (isCancelled: () => boolean) => Promise<PromptBuild>;
  withProgress: (
    work: (isCancelled: () => boolean) => Promise<PromptBuild>
  ) => PromiseLike<PromptBuild>;
}

export const runCopy = async (input: CopyRunInput): Promise<CopyRun> => {
  if (!input.gate.tryStart()) {
    return { started: false, wrote: false };
  }

  try {
    const built = await input.withProgress(cancelled => input.build(cancelled));
    const summary = input.summarize(built);

    if (summary.stop === 'user-cancelled' || summary.output.length === 0) {
      return { started: true, wrote: false, summary };
    }

    await input.clipboard.write(summary.output);

    return { started: true, wrote: true, summary };
  } finally {
    input.gate.finish();
  }
};
