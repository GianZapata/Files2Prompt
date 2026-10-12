import { filterByExtensions } from './extensionFilter';
import { mergeChanges, type PromptChange } from './selectChanges';

export type ChangeGroup = {
  repo: string;
  branch?: string;
  scope: string;
  base?: string;
  head?: string;
  changes: PromptChange[];
};

export const repoNodeLabel = (repo: string, branch?: string) => {
  const name = repo || '.';

  return branch ? `${name} · ${branch}` : name;
};

export const groupChangesByRepo = (changes: PromptChange[]) => {
  const groups = new Map<string, ChangeGroup>();

  for (const change of changes) {
    const current = groups.get(change.repo) ?? {
      repo: change.repo,
      branch: change.head,
      scope: change.scope ?? 'uncommitted',
      base: change.base,
      head: change.head,
      changes: []
    };

    current.changes.push(change);
    groups.set(change.repo, current);
  }

  return [...groups.values()];
};

export const syncChangeCheck = (input: {
  checked: boolean;
  change: PromptChange;
  selectedFiles: string[];
  promptChanges: PromptChange[];
}) => {
  const key = `${input.change.repo}\0${input.change.path}`;

  if (!input.checked) {
    return {
      files: input.selectedFiles.filter(file => file !== input.change.path),
      changes: input.promptChanges.filter(
        change => `${change.repo}\0${change.path}` !== key
      )
    };
  }

  return {
    files: [...new Set([...input.selectedFiles, input.change.path])],
    changes: mergeChanges(input.promptChanges, [input.change])
  };
};

export const syncExtensionCheck = (input: {
  checked: boolean;
  suffix: string;
  available: string[];
  selected: string[];
}) => {
  const matched = new Set(
    filterByExtensions(input.available, [
      input.suffix === '(no extension)' ? '' : input.suffix
    ])
  );

  if (!input.checked) {
    return input.selected.filter(file => !matched.has(file));
  }

  return [...new Set([...input.selected, ...matched])];
};
