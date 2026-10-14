export const PREVIEW_SCHEME = 'files2prompt-preview';
export const DETAILS_SCHEME = 'files2prompt-details';

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
