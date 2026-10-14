import type { AnyCopyStop } from '../../domain/entities/copy-stop.enum';
import type { IgnoreDecision } from '../../domain/entities/ignore-reason.enum';
import type { OutputFormat } from '../../domain/entities/output-format.enum';
import type {
  OmittedFile,
  PromptBuild,
  PromptChangeEntry,
  PromptFile
} from '../../domain/entities/prompt-payload.entity';

import * as fs from 'fs';
import * as path from 'path';

import { renderPrompt } from '../../domain/services/prompt-formats.service';

export type { OmittedFile, PromptBuild };

export interface BuildPromptInput {
  workspaceRoot: string;
  filePaths: string[];
  systemMessage?: string;
  resolve: (relativePath: string, kind: 'file' | 'directory') => IgnoreDecision;
  openText: (filePath: string) => string | undefined;
  isCancelled: () => boolean;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  changes?: PromptChangeEntry[];
  format?: OutputFormat;
}

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

  const rendered = (files: PromptFile[]) =>
    renderPrompt(input.format ?? 'xml', {
      systemMessage: input.systemMessage,
      files,
      changes: input.changes
    });
  const empty = rendered([]);

  if (Buffer.byteLength(empty) > input.maxTotalBytes) {
    return finish(
      'total-bytes',
      input,
      included,
      omittedFiles,
      omittedFolders,
      0
    );
  }

  for (let index = 0; index < input.filePaths.length; index += 1) {
    const filePath = input.filePaths[index];
    const pending = input.filePaths.length - index;

    await new Promise(resolve => setImmediate(resolve));

    if (input.isCancelled()) {
      return finish(
        'user-cancelled',
        input,
        included,
        omittedFiles,
        omittedFolders,
        pending
      );
    }

    if (included.length >= input.maxFiles) {
      return finish(
        'file-budget',
        input,
        included,
        omittedFiles,
        omittedFolders,
        pending
      );
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

    const content =
      input.openText(normalized) ?? fs.readFileSync(normalized, 'utf8');
    const nextXml = rendered([...included, { name, content }]);

    if (Buffer.byteLength(nextXml) > input.maxTotalBytes) {
      return finish(
        'total-bytes',
        input,
        included,
        omittedFiles,
        omittedFolders,
        input.filePaths.length - index
      );
    }

    included.push({ name, content });
  }

  return finish('completed', input, included, omittedFiles, omittedFolders, 0);
};

const finish = (
  stop: AnyCopyStop,
  input: BuildPromptInput,
  included: PromptFile[],
  omittedFiles: OmittedFile[],
  omittedFolders: string[],
  pending: number
): PromptBuild => {
  const output =
    stop === 'user-cancelled'
      ? ''
      : renderPrompt(input.format ?? 'xml', {
          systemMessage: input.systemMessage,
          files: included,
          changes: input.changes
        });

  return {
    stop,
    output,
    included,
    omittedFiles,
    omittedFolders,
    pending,
    byteLength: Buffer.byteLength(output)
  };
};
