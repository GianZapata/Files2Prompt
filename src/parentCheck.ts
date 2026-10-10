export const parentCheckbox = (
  children: Array<{ excluded: boolean; checked: boolean }>
) => {
  const visible = children.filter(child => !child.excluded);

  if (visible.length === 0 || visible.some(child => !child.checked)) {
    return 'unchecked' as const;
  }

  return 'checked' as const;
};

export const watcherShouldRefresh = (
  relativePath: string,
  excluded: (directory: string) => boolean
) => {
  const normalized = relativePath.split('\\').join('/');
  const name = normalized.split('/').pop() ?? '';

  if (name === '.gitignore' || name === '.promptignore') {
    return true;
  }

  const parts = normalized.split('/');

  for (let index = 0; index < parts.length - 1; index += 1) {
    if (excluded(parts.slice(0, index + 1).join('/'))) {
      return false;
    }
  }

  return true;
};
