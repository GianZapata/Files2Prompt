export type LocalizedText = {
  message: string;
  args: Array<string | number>;
};

export const copyStatusMessage = (input: {
  stop: string;
  included: number;
  omittedFiles: number;
  omittedFolders: number;
  pending: number;
}): LocalizedText => {
  if (input.stop === 'completed') {
    return {
      message: 'Copied {0} files. Omitted {1} files and {2} folders.',
      args: [input.included, input.omittedFiles, input.omittedFolders]
    };
  }

  if (input.stop === 'file-budget') {
    return {
      message:
        'Copy stopped because the file limit was reached. {0} files are still pending.',
      args: [input.pending]
    };
  }

  if (input.stop === 'total-bytes') {
    return {
      message:
        'Copy stopped because the prompt is too large. {0} files are still pending.',
      args: [input.pending]
    };
  }

  if (input.stop === 'user-cancelled') {
    return {
      message: 'Copy cancelled. Collected files were not copied.',
      args: []
    };
  }

  return {
    message: 'Copy stopped. {0} files are still pending.',
    args: [input.pending]
  };
};

export const pasteStatusMessage = (reason: string): LocalizedText => {
  if (reason === 'empty') {
    return {
      message: 'No file content found. See documentation for usage.',
      args: []
    };
  }

  if (reason === 'unsaved-conflict') {
    return {
      message: 'Paste stopped because a destination file has unsaved changes.',
      args: []
    };
  }

  if (reason === 'missing-cdata') {
    return {
      message: 'Paste stopped because file content is not CDATA.',
      args: []
    };
  }

  if (reason === 'invalid' || reason === 'invalid-path') {
    return {
      message: 'Paste stopped because a path is invalid.',
      args: []
    };
  }

  if (reason === 'duplicate-path') {
    return {
      message: 'Paste stopped because a path is duplicated.',
      args: []
    };
  }

  if (reason === 'cancelled') {
    return { message: 'Paste cancelled.', args: [] };
  }

  return { message: 'Paste stopped.', args: [] };
};
