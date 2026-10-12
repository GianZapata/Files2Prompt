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

export const languageFor = (filePath: string) => {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const dot = base.lastIndexOf('.');

  if (dot <= 0) {
    return '';
  }

  return base.slice(dot + 1).toLowerCase();
};

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

  for (const change of input.changes ?? []) {
    const fence = fenceFor(change.diff ?? '');

    parts.push(`${fence}diff\n${change.diff ?? ''}\n${fence}`);
  }

  for (const file of input.files) {
    const fence = fenceFor(file.content);
    const language = languageFor(file.name);

    parts.push(`${fence}${language}\n${file.content}\n${fence}`);
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
