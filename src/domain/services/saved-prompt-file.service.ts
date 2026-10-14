import { OutputFormat } from '../entities/output-format.enum';

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

export const fileFiltersForFormat = (
  format: OutputFormat | string
): Record<string, string[]> => {
  const ext = formatFileExtension(format);

  if (ext === 'md') {
    return {
      Markdown: ['md'],
      'All Files': ['*']
    };
  }

  if (ext === 'txt') {
    return {
      'Text Files': ['txt'],
      'All Files': ['*']
    };
  }

  return {
    XML: ['xml'],
    'All Files': ['*']
  };
};
