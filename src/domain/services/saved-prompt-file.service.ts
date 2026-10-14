import * as path from 'path';

import { OutputFormat } from '../entities/output-format.enum';

export const LAST_SAVE_FOLDER_KEY = 'files2prompt.lastSaveFolder';

const FORMAT_BY_EXTENSION = new Map<string, OutputFormat>([
  ['md', OutputFormat.Markdown],
  ['markdown', OutputFormat.Markdown],
  ['txt', OutputFormat.Plain],
  ['xml', OutputFormat.Xml]
]);

const SAVE_FILTERS = [
  { label: 'Markdown', extension: 'md' },
  { label: 'Text Files', extension: 'txt' },
  { label: 'XML', extension: 'xml' }
];

const pad = (value: number) => String(value).padStart(2, '0');

const fileNameOf = (filePath: string) => filePath.split(/[/\\]/).pop() ?? '';

export interface SaveTarget {
  format: OutputFormat;
  filePath: string;
}

export interface DefaultSaveFolderInput {
  lastFolder?: string;
  downloads: string;
  home: string;
  exists: (folder: string) => boolean;
}

export const formatFileExtension = (format: OutputFormat | string): string => {
  if (format === OutputFormat.Markdown || format === 'markdown') {
    return 'md';
  }

  if (format === OutputFormat.Plain || format === 'plain') {
    return 'txt';
  }

  return 'xml';
};

export const defaultPromptFileName = (
  format: OutputFormat | string,
  baseName = 'prompt'
): string => {
  const ext = formatFileExtension(format);

  return `${baseName}.${ext}`;
};

export const timestampedPromptFileName = (
  format: OutputFormat | string,
  moment: Date
): string => {
  const date = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
  const time = `${pad(moment.getHours())}${pad(moment.getMinutes())}`;

  return defaultPromptFileName(format, `prompt-${date}-${time}`);
};

export const tempPromptFilePath = (
  tmpDir: string,
  format: OutputFormat | string,
  moment: Date,
  flavor: path.PlatformPath = path
): string =>
  flavor.join(
    tmpDir,
    'files2prompt',
    timestampedPromptFileName(format, moment)
  );

export const formatFromExtension = (
  filePath: string
): OutputFormat | undefined => {
  const name = fileNameOf(filePath);
  const dot = name.lastIndexOf('.');

  if (dot <= 0) {
    return undefined;
  }

  return FORMAT_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase());
};

export const resolveSaveTarget = (
  filePath: string,
  fallback: OutputFormat
): SaveTarget => {
  const known = formatFromExtension(filePath);

  if (known) {
    return { format: known, filePath };
  }

  if (fileNameOf(filePath).lastIndexOf('.') > 0) {
    return { format: fallback, filePath };
  }

  return {
    format: fallback,
    filePath: `${filePath}.${formatFileExtension(fallback)}`
  };
};

export const fileFiltersForFormat = (
  format: OutputFormat | string
): Record<string, string[]> => {
  const first = formatFileExtension(format);
  const ordered = [
    ...SAVE_FILTERS.filter(filter => filter.extension === first),
    ...SAVE_FILTERS.filter(filter => filter.extension !== first)
  ];

  return Object.fromEntries(
    ordered.map(filter => [filter.label, [filter.extension]])
  );
};

export const defaultSaveFolder = (input: DefaultSaveFolderInput): string => {
  if (input.lastFolder && input.exists(input.lastFolder)) {
    return input.lastFolder;
  }

  if (input.exists(input.downloads)) {
    return input.downloads;
  }

  return input.home;
};

export const revealLabelFor = (platform: string): string => {
  if (platform === 'darwin') {
    return 'Reveal in Finder';
  }

  if (platform === 'win32') {
    return 'Reveal in File Explorer';
  }

  return 'Reveal in file manager';
};
