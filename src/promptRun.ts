import type { PromptBuild } from './buildPrompt';

import { createCopyGate } from './copyGate';

export type ClipboardPort = {
  read: () => string;
  write: (text: string) => PromiseLike<void> | void;
};

export type CopyRun = {
  started: boolean;
  wrote: boolean;
  summary?: PromptBuild;
};

export const runCopy = async (input: {
  gate: ReturnType<typeof createCopyGate>;
  clipboard: ClipboardPort;
  summarize: (built: PromptBuild) => PromptBuild;
  build: (isCancelled: () => boolean) => Promise<PromptBuild>;
  withProgress: (
    work: (isCancelled: () => boolean) => Promise<PromptBuild>
  ) => PromiseLike<PromptBuild>;
}): Promise<CopyRun> => {
  if (!input.gate.tryStart()) {
    return { started: false, wrote: false };
  }

  try {
    const built = await input.withProgress(cancelled => input.build(cancelled));
    const summary = input.summarize(built);

    if (summary.stop === 'user-cancelled' || summary.xml.length === 0) {
      return { started: true, wrote: false, summary };
    }

    await input.clipboard.write(summary.xml);

    return { started: true, wrote: true, summary };
  } finally {
    input.gate.finish();
  }
};

export const runPreview = async (input: {
  clipboard: ClipboardPort;
  build: () => Promise<PromptBuild>;
  summarize: (built: PromptBuild) => PromptBuild;
}) => {
  const before = input.clipboard.read();
  const summary = input.summarize(await input.build());

  return {
    summary,
    clipboard: input.clipboard.read(),
    wrote: input.clipboard.read() !== before,
    before
  };
};
