import type { PromptBuild } from '../entities/prompt-payload.entity';

import {
  OperationKind,
  type AnyOperationKind
} from '../entities/operation-kind.enum';

export { OperationKind, type AnyOperationKind };

export interface OperationReportManualInclude {
  path: string;
  pattern: string;
  sourceFile: string;
}

export interface FormatOperationReportInput {
  kind: AnyOperationKind;
  summary?: PromptBuild;
  wrote: boolean;
  manualIncludes?: OperationReportManualInclude[];
}

export const formatOperationReport = (input: FormatOperationReportInput) => {
  if (input.kind === OperationKind.EmptySelection) {
    return [
      'Operation: empty-selection',
      'Stop: empty-selection',
      'Collected: 0',
      'Copied: 0',
      'Clipboard write: no'
    ].join('\n');
  }

  const summary = input.summary;
  const collected = summary?.included.length ?? 0;
  const copied = input.wrote ? collected : 0;

  return [
    `Operation: ${input.kind}`,
    `Stop: ${summary?.stop ?? 'unknown'}`,
    `Collected: ${collected}`,
    `Copied: ${copied}`,
    `Clipboard write: ${input.wrote ? 'yes' : 'no'}`,
    `Bytes: ${summary?.byteLength ?? 0}`,
    `Pending: ${summary?.pending ?? 0}`,
    `Omitted files: ${summary?.omittedFiles.length ?? 0}`,
    `Omitted folders: ${summary?.omittedFolders.length ?? 0}`,
    ...(summary?.included.map(file => `Collected file: ${file.name}`) ?? []),
    ...(summary?.omittedFolders.map(folder => `${folder} — pruned-folder`) ??
      []),
    ...(input.manualIncludes?.map(
      file =>
        `${file.path} — included manually (rule: ${file.pattern}, ${file.sourceFile})`
    ) ?? []),
    ...(summary?.omittedFiles.map(
      file =>
        `${file.path} — ${file.reason}${file.pattern ? ` (${file.pattern})` : ''}`
    ) ?? [])
  ].join('\n');
};

export const createDetailBook = () => {
  const reports = new Map<string, string>();
  let latestId = '';
  let nextId = 0;

  return {
    save: (report: string) => {
      nextId += 1;
      const id = String(nextId);

      reports.set(id, report);
      latestId = id;

      return id;
    },
    open: (id: string) => reports.get(id),
    latest: () => (latestId ? reports.get(latestId) : undefined)
  };
};

export const isEmptySelection = (
  filePaths: string[],
  omittedFolders: string[]
) => filePaths.length === 0 && omittedFolders.length === 0;
