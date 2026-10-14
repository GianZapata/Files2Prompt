export interface LocalizedText {
  message: string;
  args: Array<string | number>;
}

export interface CopyStatusInput {
  stop: string;
  included: number;
  omittedFiles: number;
  omittedFolders: number;
  pending: number;
}

export interface SaveStatusInput {
  stop: string;
  included: number;
  omittedFiles: number;
  omittedFolders: number;
  pending: number;
  fileName: string;
}

export interface PreviewStatusInput {
  stop: string;
  included: number;
  pending: number;
}

export const copyStatusMessage = (input: CopyStatusInput): LocalizedText => {
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

export const saveStatusMessage = (input: SaveStatusInput): LocalizedText => {
  if (input.stop === 'completed') {
    return {
      message: 'Saved {0} files to {1}. Omitted {2} files and {3} folders.',
      args: [
        input.included,
        input.fileName,
        input.omittedFiles,
        input.omittedFolders
      ]
    };
  }

  if (input.stop === 'file-budget') {
    return {
      message:
        'Save stopped because the file limit was reached. {0} files are still pending.',
      args: [input.pending]
    };
  }

  if (input.stop === 'total-bytes') {
    return {
      message:
        'Save stopped because the prompt is too large. {0} files are still pending.',
      args: [input.pending]
    };
  }

  if (input.stop === 'user-cancelled') {
    return {
      message: 'Save cancelled. Collected files were not saved.',
      args: []
    };
  }

  return {
    message: 'Save stopped. {0} files are still pending.',
    args: [input.pending]
  };
};

export const previewStatusMessage = (
  input: PreviewStatusInput
): LocalizedText => {
  if (input.stop === 'completed') {
    return { message: 'Prompt preview opened.', args: [] };
  }

  if (input.stop === 'total-bytes') {
    return {
      message:
        'Preview includes {0} files. {1} were left out because the prompt is too large. Change promptfold.maxTotalBytes.',
      args: [input.included, input.pending]
    };
  }

  if (input.stop === 'file-budget') {
    return {
      message:
        'Preview includes {0} files. {1} were left out because the file limit was reached. Change promptfold.maxFiles.',
      args: [input.included, input.pending]
    };
  }

  return {
    message: 'Preview includes {0} files. {1} were left out.',
    args: [input.included, input.pending]
  };
};
