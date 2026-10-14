import type {
  PromptChangeEntry,
  PromptFile
} from '../entities/prompt-payload.entity';

import { OutputFormat } from '../entities/output-format.enum';

import {
  serializeChanges,
  serializedFile,
  serializedSystemMessage
} from './prompt-xml.service';

export type { OutputFormat };

export interface PromptDocument {
  systemMessage?: string;
  files: PromptFile[];
  changes?: PromptChangeEntry[];
}

const languageAliases: Record<string, string> = {
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  py: 'python',
  rb: 'ruby',
  sh: 'sh',
  bash: 'bash',
  tsx: 'tsx',
  jsx: 'jsx'
};

export const languageFor = (filePath: string) => {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const lower = base.toLowerCase();

  if (lower === 'dockerfile') {
    return 'dockerfile';
  }

  if (lower.endsWith('.blade.php')) {
    return 'blade';
  }

  const dot = base.lastIndexOf('.');

  if (dot <= 0) {
    return '';
  }

  const extension = base.slice(dot + 1).toLowerCase();

  return languageAliases[extension] ?? extension;
};

const promptStatus = (status: string) => status.toLowerCase();

const promptScope = (scope?: string) => (scope ?? 'uncommitted').toLowerCase();

const changeGroupKey = (change: PromptChangeEntry) =>
  `${change.repo}\0${change.scope ?? ''}\0${change.base ?? ''}\0${change.head ?? ''}`;

export const fenceFor = (content: string) => {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);

  return '`'.repeat(Math.max(3, longest + 1));
};

const hasDiff = (diff?: string) => (diff ?? '').trim().length > 0;

const markdownChange = (change: PromptChangeEntry) => {
  const heading = `### ${change.path} (${promptStatus(change.status)})`;

  if (change.binary) {
    return `${heading}\n_Binary file, no diff._`;
  }

  if (change.generated) {
    return `${heading}\n_Generated file, diff omitted._`;
  }

  if (!hasDiff(change.diff)) {
    return `${heading}\n_No diff._`;
  }

  const fence = fenceFor(change.diff ?? '');

  return `${heading}\n${fence}diff\n${change.diff ?? ''}\n${fence}`;
};

const plainChange = (change: PromptChangeEntry) => {
  const status = promptStatus(change.status);

  if (change.binary) {
    return `=== DIFF ${change.path} (${status}, binary) ===`;
  }

  if (change.generated) {
    return `=== DIFF ${change.path} (${status}, generated, diff omitted) ===`;
  }

  const heading = `=== DIFF ${change.path} (${status}) ===`;

  if (!hasDiff(change.diff)) {
    return `${heading}\n(no diff)`;
  }

  return `${heading}\n${change.diff ?? ''}`;
};

const markdownFile = (file: PromptFile) => {
  const fence = fenceFor(file.content);
  const language = languageFor(file.name);

  return `### ${file.name}\n${fence}${language}\n${file.content}\n${fence}`;
};

const markdownPrefix = (input: PromptDocument) => {
  const parts: string[] = [];

  if (input.systemMessage) {
    parts.push(input.systemMessage);
  }

  const groups = new Map<string, PromptChangeEntry[]>();

  for (const change of input.changes ?? []) {
    const key = changeGroupKey(change);
    const group = groups.get(key) ?? [];

    group.push(change);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const sample = group[0];
    const heading = `## Git changes — ${sample.repo} (${promptScope(sample.scope)}, ${sample.base ?? '—'} → ${sample.head ?? 'HEAD'})`;
    const blocks = group.map(markdownChange);

    parts.push([heading, ...blocks].join('\n\n'));
  }

  return parts.join('\n\n');
};

const plainFile = (file: PromptFile) =>
  `=== FILE ${file.name} ===\n${file.content}`;

const plainPrefix = (input: PromptDocument) =>
  [
    ...(input.systemMessage ? [input.systemMessage] : []),
    ...(input.changes ?? []).map(plainChange)
  ].join('\n\n');

const xmlPrefix = (input: PromptDocument) =>
  `<files>${
    input.systemMessage ? serializedSystemMessage(input.systemMessage) : ''
  }${serializeChanges(input.changes ?? [])}`;

export interface PromptLayout {
  piece: (file: PromptFile) => string;
  assemble: (pieces: string[]) => string;
  emptyBytes: number;
  bytesToAdd: (pieceBytes: number, alreadyAdded: number) => number;
}

export const promptLayout = (
  format: OutputFormat | string,
  input: Omit<PromptDocument, 'files'>
): PromptLayout => {
  const document = { ...input, files: [] };
  const isMarkdown = format === OutputFormat.Markdown;
  const isPlain = format === OutputFormat.Plain;
  const isXml = !isMarkdown && !isPlain;
  const prefix = isMarkdown
    ? markdownPrefix(document)
    : isPlain
      ? plainPrefix(document)
      : xmlPrefix(document);
  const suffix = isXml ? '</files>' : '';
  const separator = isXml ? '' : '\n\n';
  const piece = isMarkdown
    ? markdownFile
    : isPlain
      ? plainFile
      : serializedFile;
  const separatorBytes = Buffer.byteLength(separator);

  return {
    piece,
    emptyBytes: Buffer.byteLength(prefix) + Buffer.byteLength(suffix),
    bytesToAdd: (pieceBytes, alreadyAdded) =>
      pieceBytes + (alreadyAdded > 0 || prefix !== '' ? separatorBytes : 0),
    assemble: pieces =>
      `${prefix}${prefix !== '' && pieces.length > 0 ? separator : ''}${pieces.join(separator)}${suffix}`
  };
};

export const renderPrompt = (
  format: OutputFormat | string,
  input: PromptDocument
) => {
  const layout = promptLayout(format, input);

  return layout.assemble(input.files.map(layout.piece));
};
