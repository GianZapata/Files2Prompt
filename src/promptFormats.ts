import { changeStatusLabel } from './selectChanges';
import {
  serializePrompt,
  type PromptChangeEntry,
  type PromptFile
} from './promptXml';

export type OutputFormat = 'xml' | 'markdown' | 'plain';

export type PromptDocument = {
  systemMessage?: string;
  files: PromptFile[];
  changes?: PromptChangeEntry[];
};

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

const scopeLabel = (scope?: string) => {
  if (scope === 'uncommitted') {
    return 'sin commit';
  }

  if (scope === 'staged') {
    return 'en stage';
  }

  if (scope === 'commit') {
    return 'commit';
  }

  if (scope === 'branch') {
    return 'rama';
  }

  return scope ?? 'cambios';
};

const changeGroupKey = (change: PromptChangeEntry) =>
  `${change.repo}\0${change.scope ?? ''}\0${change.base ?? ''}\0${change.head ?? ''}`;

export const fenceFor = (content: string) => {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);

  return '`'.repeat(Math.max(3, longest + 1));
};

export const renderPrompt = (format: OutputFormat, input: PromptDocument) => {
  if (format === 'markdown') {
    return renderMarkdown(input);
  }

  if (format === 'plain') {
    return renderPlain(input);
  }

  return serializePrompt(input);
};

export const languageIdFor = (format: OutputFormat) => {
  if (format === 'markdown') {
    return 'markdown';
  }

  if (format === 'plain') {
    return 'plaintext';
  }

  return 'xml';
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
    const heading = `## Cambios de Git — ${sample.repo} (${scopeLabel(sample.scope)}, ${sample.base ?? '—'} → ${sample.head ?? 'HEAD'})`;
    const blocks = group.map(change => {
      const fence = fenceFor(change.diff ?? '');

      return `### ${change.path} (${changeStatusLabel(change.status)})\n${fence}diff\n${change.diff ?? ''}\n${fence}`;
    });

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
    parts.push(`--- ${change.path} ---\n${change.diff ?? ''}`);
  }

  for (const file of input.files) {
    parts.push(`--- ${file.name} ---\n${file.content}`);
  }

  return parts.join('\n\n');
};
