import type {
  PromptChangeEntry,
  PromptFile
} from '../entities/prompt-payload.entity';

import { OutputFormat } from '../entities/output-format.enum';

import {
  serializeChanges,
  serializedFile,
  serializedSystemMessage,
  serializedTree
} from './prompt-xml.service';

export type { OutputFormat };

export interface PromptDocument {
  systemMessage?: string;
  files: PromptFile[];
  changes?: PromptChangeEntry[];
  tree?: string;
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

const markdownChanges = (input: PromptDocument) => {
  const groups = new Map<string, PromptChangeEntry[]>();

  for (const change of input.changes ?? []) {
    const key = changeGroupKey(change);
    const group = groups.get(key) ?? [];

    group.push(change);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(group => {
      const sample = group[0];
      const heading = `## Git changes — ${sample.repo} (${promptScope(sample.scope)}, ${sample.base ?? '—'} → ${sample.head ?? 'HEAD'})`;

      return [heading, ...group.map(markdownChange)].join('\n\n');
    })
    .join('\n\n');
};

const markdownTree = (tree: string) =>
  `## Structure\n\n\`\`\`text\n${tree}\n\`\`\``;

const plainFile = (file: PromptFile) =>
  `=== FILE ${file.name} ===\n${file.content}`;

const plainChanges = (input: PromptDocument) =>
  (input.changes ?? []).map(plainChange).join('\n\n');

const plainTree = (tree: string) => `=== TREE ===\n${tree}`;

export interface LayoutSize {
  pieceBytes: number;
  pieceCount: number;
  treeBytes: number;
}

export interface PromptLayoutInput {
  systemMessage?: string;
  changes?: PromptChangeEntry[];
}

export interface PromptLayout {
  piece: (file: PromptFile) => string;
  assemble: (pieces: string[], tree?: string) => string;
  bytes: (size: LayoutSize) => number;
}

interface FormatKit {
  head: (systemMessage?: string) => string;
  changes: (input: PromptDocument) => string;
  tree: (tree: string) => string;
  piece: (file: PromptFile) => string;
  suffix: string;
  separator: string;
}

const formatKits: Record<string, FormatKit> = {
  [OutputFormat.Xml]: {
    head: systemMessage =>
      `<files>${systemMessage ? serializedSystemMessage(systemMessage) : ''}`,
    changes: input => serializeChanges(input.changes ?? []),
    tree: serializedTree,
    piece: serializedFile,
    suffix: '</files>',
    separator: ''
  },
  [OutputFormat.Markdown]: {
    head: systemMessage => systemMessage ?? '',
    changes: markdownChanges,
    tree: markdownTree,
    piece: markdownFile,
    suffix: '',
    separator: '\n\n'
  },
  [OutputFormat.Plain]: {
    head: systemMessage => systemMessage ?? '',
    changes: plainChanges,
    tree: plainTree,
    piece: plainFile,
    suffix: '',
    separator: '\n\n'
  }
};

export const promptLayout = (
  format: OutputFormat | string,
  input: PromptLayoutInput
): PromptLayout => {
  const kit = formatKits[format] ?? formatKits[OutputFormat.Xml];
  const { piece, suffix, separator } = kit;
  const treeBlock = kit.tree;
  const head = kit.head(input.systemMessage);
  const changes = kit.changes({ ...input, files: [] });
  const separatorBytes = Buffer.byteLength(separator);

  const frameBytes = Buffer.byteLength(treeBlock(''));
  const fixedBytes = Buffer.byteLength(head + changes + suffix);
  const fixedSections = [head, changes].filter(part => part !== '').length;

  return {
    piece,
    bytes: size => {
      const hasTree = size.treeBytes > 0;
      const sections = fixedSections + (hasTree ? 1 : 0) + size.pieceCount;
      const treeTotal = hasTree ? frameBytes + size.treeBytes : 0;

      return (
        fixedBytes +
        treeTotal +
        size.pieceBytes +
        Math.max(sections - 1, 0) * separatorBytes
      );
    },
    assemble: (pieces, tree = '') =>
      [head, ...(tree === '' ? [] : [treeBlock(tree)]), changes, ...pieces]
        .filter(part => part !== '')
        .join(separator) + suffix
  };
};

export const renderPrompt = (
  format: OutputFormat | string,
  input: PromptDocument
) => {
  const layout = promptLayout(format, input);

  return layout.assemble(input.files.map(layout.piece), input.tree);
};
