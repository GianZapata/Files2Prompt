export const PREVIEW_SCHEME = 'files2prompt-preview';

export const createPreviewSource = () => {
  let content = '';

  return {
    uri: `${PREVIEW_SCHEME}:prompt.xml`,
    set: (value: string) => {
      content = value;
    },
    get: () => content
  };
};
