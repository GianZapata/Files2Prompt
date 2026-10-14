export interface CheckboxForFolderInput {
  included: boolean;
  reason?: string;
}

export interface ParentCheckboxChild {
  excluded: boolean;
  checked: boolean;
  emptyFolder?: boolean;
}

export const checkboxForFolder = (
  input: CheckboxForFolderInput
): 'hidden' | 'unchecked' => {
  if (
    !input.included &&
    (input.reason === 'built-in' || input.reason === 'promptignore')
  ) {
    return 'hidden';
  }

  return 'unchecked';
};

export const parentCheckbox = (
  children: ParentCheckboxChild[]
): 'checked' | 'unchecked' => {
  const visible = children.filter(
    child => !child.excluded && !child.emptyFolder
  );

  if (visible.length === 0 || visible.some(child => !child.checked)) {
    return 'unchecked';
  }

  return 'checked';
};

export const watcherShouldRefresh = (
  relativePath: string,
  excluded: (directory: string) => boolean
): boolean => {
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
