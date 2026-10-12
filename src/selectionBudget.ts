export const nextOutputFormat = (current: string, picked?: string) => ({
  format: picked ?? current,
  changed: picked !== undefined && picked !== current,
  wroteClipboard: false
});

export const formatForCopy = <T extends string>(setting: T, override?: T) =>
  override ?? setting;

export const shouldRefreshSummary = (section: string) =>
  section === 'files2prompt.outputFormat';

export const outputFormatLabel = (format: string) => {
  if (format === 'markdown') {
    return 'Markdown';
  }

  if (format === 'plain') {
    return 'Plain text';
  }

  return 'XML';
};

export const selectionStatus = (input: {
  fileCount: number;
  byteLabel: string;
  changeCount: number;
  repositoryCount: number;
  format: string;
}) => {
  const formatLabel = outputFormatLabel(input.format);
  const tooltip = `${input.fileCount} selected files, ${input.byteLabel}. ${input.changeCount} Git changes in ${input.repositoryCount} repositories. Output format: ${formatLabel}.`;

  return {
    text: `$(files) ${input.fileCount} files · ${input.byteLabel} · ${formatLabel}`,
    tooltip,
    accessibility: `${tooltip} Choose the output format.`
  };
};

export const shouldConfirmIgnored = (input: {
  setting: boolean;
  remembered: boolean;
}) => input.setting && !input.remembered;

export const formatByteSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export type LimitNotice = {
  over: boolean;
  message: string;
  args: Array<string | number>;
};

export const overLimitNotice = (input: {
  fileCount: number;
  byteCount: number;
  maxFiles: number;
  maxTotalBytes: number;
}): LimitNotice => {
  if (input.fileCount > input.maxFiles) {
    return {
      over: true,
      message:
        'This selection has {0} files, {1} over the limit of {2}. Change files2prompt.maxFiles, copy what fits, or cancel.',
      args: [input.fileCount, input.fileCount - input.maxFiles, input.maxFiles]
    };
  }

  if (input.byteCount > input.maxTotalBytes) {
    return {
      over: true,
      message:
        'This selection is about {0}, {1} over the limit of {2}. Change files2prompt.maxTotalBytes, copy what fits, or cancel.',
      args: [
        formatByteSize(input.byteCount),
        formatByteSize(input.byteCount - input.maxTotalBytes),
        formatByteSize(input.maxTotalBytes)
      ]
    };
  }

  return { over: false, message: '', args: [] };
};
