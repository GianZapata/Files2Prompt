import type {
  PromptChangeEntry,
  PromptFile
} from '../entities/prompt-payload.entity';

import { OutputFormat } from '../entities/output-format.enum';

import { serializePrompt } from './prompt-xml.service';

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

export const languageIdFor = (format: OutputFormat | string) => {
  if (format === OutputFormat.Markdown || format === 'markdown') {
    return 'markdown';
  }

  if (format === OutputFormat.Plain || format === 'plain') {
    return 'plaintext';
  }

  return 'xml';
};

const hasDiff = (diff?: string) => (diff ?? '').trim().length > 0;

const markdownChange = (change: PromptChangeEntry) => {
  const heading = `### ${change.path} (${promptStatus(change.status)})`;

  if (change.binary) {
    return `${heading}\n_Binary file, no diff._`;
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

  const heading = `=== DIFF ${change.path} (${status}) ===`;

  if (!hasDiff(change.diff)) {
    return `${heading}\n(no diff)`;
  }

  return `${heading}\n${change.diff ?? ''}`;
};

const renderMarkdown = (input: PromptDocument) => {
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

  for (const file of input.files) {
    const fence = fenceFor(file.content);
    const language = languageFor(file.name);

    parts.push(
      `### ${file.name}\n${fence}${language}\n${file.content}\n${fence}`
    );
  }

  return parts.join('\n\n');
};

const renderPlain = (input: PromptDocument) => {
  const parts: string[] = [];

  if (input.systemMessage) {
    parts.push(input.systemMessage);
  }

  for (const change of input.changes ?? []) {
    parts.push(plainChange(change));
  }

  for (const file of input.files) {
    parts.push(`=== FILE ${file.name} ===\n${file.content}`);
  }

  return parts.join('\n\n');
};

export const renderPrompt = (
  format: OutputFormat | string,
  input: PromptDocument
) => {
  if (format === OutputFormat.Markdown || format === 'markdown') {
    return renderMarkdown(input);
  }

  if (format === OutputFormat.Plain || format === 'plain') {
    return renderPlain(input);
  }

  return serializePrompt(input);
};
