import type { OutputFormat } from '../../domain/entities/output-format.enum';

import { defaultPromptFileName } from '../../domain/services/saved-prompt-file.service';

export const PREVIEW_SCHEME = 'promptfold-preview';
export const DETAILS_SCHEME = 'promptfold-details';

export const createPreviewSource = () => {
  const contents = new Map<string, string>();

  return {
    uriFor: (format: OutputFormat) =>
      `${PREVIEW_SCHEME}:${defaultPromptFileName(format)}`,
    set: (uri: string, value: string) => {
      contents.set(uri, value);
    },
    get: (uri: string) => contents.get(uri) ?? ''
  };
};

export const createDetailsSource = () => {
  let content = '';

  return {
    uri: `${DETAILS_SCHEME}:details.txt`,
    set: (value: string) => {
      content = value;
    },
    get: () => content
  };
};
