import * as path from 'path';

export const isSameOrInside = (
  parent: string,
  child: string,
  flavor: path.PlatformPath = path
): boolean => {
  const relative = flavor.relative(parent, child);

  if (relative === '') {
    return true;
  }

  if (flavor.isAbsolute(relative)) {
    return false;
  }

  return relative !== '..' && !relative.startsWith(`..${flavor.sep}`);
};
