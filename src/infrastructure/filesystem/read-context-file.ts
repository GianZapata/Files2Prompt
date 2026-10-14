import * as fs from 'fs';

export const readContextText = (
  filePath: string,
  openText: (filePath: string) => string | undefined
): string => {
  const open = openText(filePath);

  if (open !== undefined) {
    return open;
  }

  return fs.readFileSync(filePath, 'utf8');
};
