import type { PromptBuild } from './buildPrompt';

export type OperationKind =
  'copy' | 'preview' | 'cancelled' | 'empty-selection';

export const formatOperationReport = (input: {
  kind: OperationKind;
  summary?: PromptBuild;
  wrote: boolean;
}) => {
  if (input.kind === 'empty-selection') {
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
