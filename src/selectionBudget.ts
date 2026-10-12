export const selectionStatus = (input: {
  fileCount: number;
  byteLabel: string;
  changeCount: number;
  repositoryCount: number;
}) => {
  const changes =
    input.changeCount > 0 ? ` · $(git-compare) ${input.changeCount}` : '';
  const tooltip =
    input.changeCount > 0
      ? `${input.fileCount} selected files, ${input.byteLabel}. ${input.changeCount} Git changes in ${input.repositoryCount} repositories.`
      : `${input.fileCount} selected files, ${input.byteLabel}.`;

  return {
    text: `$(files) ${input.fileCount} · ${input.byteLabel}${changes}`,
    tooltip,
    accessibility: `${tooltip} Opens the prompt preview.`
  };
};

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
