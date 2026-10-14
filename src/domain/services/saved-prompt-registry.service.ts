import * as path from 'path';

import { isSameOrInside } from '../helpers/path-containment';

export const SAVED_PROMPTS_KEY = 'promptfold.savedPrompts';

const SAVED_PROMPT_LIMIT = 500;

export interface SavedPromptRegistry {
  has: (relativePath: string) => boolean;
  register: (relativePath: string) => void;
  list: () => string[];
}

export const createSavedPromptRegistry = (
  initial: string[] = [],
  limit = SAVED_PROMPT_LIMIT
): SavedPromptRegistry => {
  const entries = new Set(initial.slice(-limit));

  return {
    has: relativePath => entries.has(relativePath),
    register: relativePath => {
      entries.add(relativePath);

      if (entries.size > limit) {
        entries.delete(entries.values().next().value as string);
      }
    },
    list: () => [...entries]
  };
};

export const savedPromptRelativePath = (
  workspaceRoot: string,
  filePath: string,
  flavor: path.PlatformPath = path
): string | undefined => {
  if (!isSameOrInside(workspaceRoot, filePath, flavor)) {
    return undefined;
  }

  const relative = flavor.relative(workspaceRoot, filePath);

  if (relative === '') {
    return undefined;
  }

  return relative.split(flavor.sep).join('/');
};
