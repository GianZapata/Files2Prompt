export const restoreEffective = (
  paths: string[],
  exists: (filePath: string) => boolean,
  included: (filePath: string) => boolean
): string[] => paths.filter(filePath => exists(filePath) && included(filePath));

export const uncheckFolder = (
  checked: Set<string>,
  folderPath: string
): void => {
  const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

  for (const filePath of [...checked]) {
    if (filePath === folderPath || filePath.startsWith(prefix)) {
      checked.delete(filePath);
    }
  }
};
