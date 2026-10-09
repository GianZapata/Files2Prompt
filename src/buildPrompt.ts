import type { IgnoreDecision } from './ignore/ignoreReason';

import fs from 'fs';
import path from 'path';

import { serializePrompt, type PromptFile } from './promptXml';

export type CopyStop =
  'completed' | 'user-cancelled' | 'file-budget' | 'total-bytes';

export type OmittedFile = {
  path: string;
  reason: string;
  pattern?: string;
};

export type PromptBuild = {
  stop: CopyStop;
  xml: string;
  included: PromptFile[];
  omittedFiles: OmittedFile[];
  omittedFolders: string[];
};

export type BuildPromptInput = {
  workspaceRoot: string;
  filePaths: string[];
  systemMessage?: string;
  resolve: (relativePath: string, kind: 'file' | 'directory') => IgnoreDecision;
  openText: (filePath: string) => string | undefined;
  isCancelled: () => boolean;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
};

const relativeName = (workspaceRoot: string, filePath: string) =>
  path.relative(workspaceRoot, filePath).split(path.sep).join('/');

const hasNul = (buffer: Buffer) => buffer.includes(0);

export const buildPrompt = async (
  input: BuildPromptInput
): Promise<PromptBuild> => {
  const included: PromptFile[] = [];
  const omittedFiles: OmittedFile[] = [];
  const omittedFolders: string[] = [];
  const seen = new Set<string>();

  const empty = serializePrompt({
    systemMessage: input.systemMessage,
    files: []
  });

  if (Buffer.byteLength(empty) > input.maxTotalBytes) {
    return {
      stop: 'total-bytes',
      xml: '',
      included,
      omittedFiles,
      omittedFolders
    };
  }

  for (const filePath of input.filePaths) {
    await new Promise(resolve => setImmediate(resolve));

    if (input.isCancelled()) {
      return {
        stop: 'user-cancelled',
        xml: '',
        included,
        omittedFiles,
        omittedFolders
      };
    }

    const normalized = path.resolve(filePath);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);

    if (!fs.existsSync(normalized) || !fs.lstatSync(normalized).isFile()) {
      continue;
    }

    const name = relativeName(input.workspaceRoot, normalized);
    const decision = input.resolve(name, 'file');

    if (!decision.included) {
      omittedFiles.push({
        path: name,
        reason: decision.reason ?? 'ignored',
        pattern: decision.pattern
      });

      continue;
    }

    const size = fs.statSync(normalized).size;

    if (size > input.maxFileBytes) {
      omittedFiles.push({ path: name, reason: 'file-size' });

      continue;
    }

    const sample = Buffer.alloc(8192);
    const handle = fs.openSync(normalized, 'r');
    const read = fs.readSync(handle, sample, 0, 8192, 0);

    fs.closeSync(handle);

    if (hasNul(sample.subarray(0, read))) {
      omittedFiles.push({ path: name, reason: 'binary' });

      continue;
    }

    if (included.length >= input.maxFiles) {
      return finish(
        'file-budget',
        input,
        included,
        omittedFiles,
        omittedFolders
      );
    }

    const content =
      input.openText(normalized) ?? fs.readFileSync(normalized, 'utf8');
    const next = [...included, { name, content }];
    const xml = serializePrompt({
      systemMessage: input.systemMessage,
      files: next
    });

    if (Buffer.byteLength(xml) > input.maxTotalBytes) {
      return finish(
        'total-bytes',
        input,
        included,
        omittedFiles,
        omittedFolders
      );
    }

    included.push({ name, content });
  }

  return finish('completed', input, included, omittedFiles, omittedFolders);
};

const finish = (
  stop: CopyStop,
  input: BuildPromptInput,
  included: PromptFile[],
  omittedFiles: OmittedFile[],
  omittedFolders: string[]
): PromptBuild => ({
  stop,
  xml:
    stop === 'user-cancelled'
      ? ''
      : serializePrompt({
          systemMessage: input.systemMessage,
          files: included
        }),
  included,
  omittedFiles,
  omittedFolders
});

export const countPrunedFolder = (relativePath: string) => {
  omittedFolderName(relativePath);
};

const omittedFolderName = (relativePath: string) => relativePath;
