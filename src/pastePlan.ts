import fs from 'fs';

import { resolveInsideWorkspace } from './workspacePath';

export type PasteEntry = {
  name: string;
  content: string;
};

export type PasteRejection =
  'invalid-path' | 'duplicate-path' | 'unsaved-conflict';

export type PasteWrite = {
  relativePath: string;
  absolutePath: string;
  content: string;
  existed: boolean;
};

export type PastePlan =
  | { ok: true; writes: PasteWrite[] }
  | { ok: false; reason: PasteRejection; paths: string[] };

export const planPaste = (
  workspaceRoot: string,
  entries: PasteEntry[],
  isDirty: (absolutePath: string) => boolean,
  exists: (absolutePath: string) => boolean = fs.existsSync
): PastePlan => {
  const writes: PasteWrite[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const dirty: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolveInsideWorkspace(workspaceRoot, entry.name);

    if (!absolutePath) {
      invalid.push(entry.name);

      continue;
    }

    if (seen.has(absolutePath)) {
      duplicates.push(entry.name);
    }

    seen.add(absolutePath);

    if (isDirty(absolutePath)) {
      dirty.push(entry.name);
    }

    writes.push({
      relativePath: entry.name,
      absolutePath,
      content: entry.content,
      existed: exists(absolutePath)
    });
  }

  if (invalid.length > 0) {
    return { ok: false, reason: 'invalid-path', paths: invalid };
  }

  if (duplicates.length > 0) {
    return { ok: false, reason: 'duplicate-path', paths: duplicates };
  }

  if (dirty.length > 0) {
    return { ok: false, reason: 'unsaved-conflict', paths: dirty };
  }

  return { ok: true, writes };
};
