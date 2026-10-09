import path from 'path';

import { planPaste } from './pastePlan';
import { parsePrompt } from './promptXml';

export const applyPastedXml = async (input: {
  xml: string;
  workspaceRoot: string;
  isDirty: (absolutePath: string) => boolean;
  exists: (absolutePath: string) => boolean;
  mkdir: (directory: string) => Promise<void> | Promise<string | undefined>;
  write: (filePath: string, content: string) => Promise<void>;
  read: (filePath: string) => Promise<string>;
}) => {
  const parsed = parsePrompt(input.xml);

  if (!parsed || parsed.files.length === 0) {
    return { mkdirCalls: 0, writeCalls: 0, reason: 'empty' };
  }

  const planned = planPaste(
    input.workspaceRoot,
    parsed.files,
    input.isDirty,
    input.exists
  );

  if (!planned.ok) {
    return { mkdirCalls: 0, writeCalls: 0, reason: planned.reason };
  }

  let mkdirCalls = 0;
  let writeCalls = 0;
  const written: Array<{
    relativePath: string;
    absolutePath: string;
    existed: boolean;
  }> = [];

  for (const item of planned.writes) {
    await input.mkdir(path.dirname(item.absolutePath));
    mkdirCalls += 1;

    if (
      item.existed &&
      (await input.read(item.absolutePath)) === item.content
    ) {
      continue;
    }

    await input.write(item.absolutePath, item.content);
    writeCalls += 1;
    written.push({
      relativePath: item.relativePath,
      absolutePath: item.absolutePath,
      existed: item.existed
    });
  }

  return { mkdirCalls, writeCalls, reason: 'ok', written };
};
