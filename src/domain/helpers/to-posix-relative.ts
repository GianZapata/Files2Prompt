import * as path from 'path';

export const toPosixRelative = (root: string, target: string) =>
  path.relative(root, target).split(path.sep).join('/');
