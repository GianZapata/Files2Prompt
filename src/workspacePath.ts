import fs from 'fs';
import path from 'path';

const hasNul = (value: string) => value.includes('\0');

const isWindowsAbsolute = (value: string) =>
  /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\');

export const resolveInsideWorkspace = (
  workspaceRoot: string,
  requested: string
): string | undefined => {
  if (!requested || hasNul(requested)) {
    return undefined;
  }

  if (path.isAbsolute(requested) || isWindowsAbsolute(requested)) {
    return undefined;
  }

  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, requested);
  const relative = path.relative(root, target);

  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }

  if (!existingAncestorStaysInside(root, target)) {
    return undefined;
  }

  return target;
};

const existingAncestorStaysInside = (root: string, target: string) => {
  let current = target;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);

    if (parent === current) {
      return false;
    }

    current = parent;
  }

  const realRoot = fs.realpathSync(root);
  const realCurrent = fs.realpathSync(current);
  const relative = path.relative(realRoot, realCurrent);

  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};
