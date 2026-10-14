export interface HasSuffixes {
  suffixes: string[];
}

const baseName = (filePath: string) =>
  filePath.split(/[/\\]/).pop() ?? filePath;

export const extensionSuffix = (filePath: string) => {
  const base = baseName(filePath);

  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.toLowerCase();
  }

  const dot = base.indexOf('.');

  if (dot <= 0) {
    return '';
  }

  return base.slice(dot).toLowerCase();
};

export const normalizeExtensionQuery = (token: string) => {
  const trimmed = token.trim().toLowerCase().replace(/^\.+/, '');

  if (!trimmed) {
    return '';
  }

  return `.${trimmed}`;
};

export const parseExtensionList = (text: string) => [
  ...new Set(
    text
      .split(/[\s,]+/)
      .map(normalizeExtensionQuery)
      .filter(token => token.length > 0)
  )
];

export const extensionPickItems = <T extends HasSuffixes>(
  detected: T[],
  typed: string
) => {
  const custom = parseExtensionList(typed);

  if (custom.length === 0) {
    return detected;
  }

  return [
    {
      label: typed,
      description: custom.join(', '),
      suffixes: custom,
      alwaysShow: true
    },
    ...detected
  ];
};

export const matchesExtension = (filePath: string, query: string) => {
  const normalized = normalizeExtensionQuery(query);
  const base = baseName(filePath).toLowerCase();

  if (!normalized) {
    return extensionSuffix(filePath) === '';
  }

  return base.endsWith(normalized);
};

export const filterByExtensions = (
  relativePaths: string[],
  queries: string[]
) =>
  relativePaths.filter(filePath =>
    queries.some(query => matchesExtension(filePath, query))
  );

export const extensionCounts = (relativePaths: string[]) => {
  const counts = new Map<string, number>();

  for (const filePath of relativePaths) {
    const suffix = extensionSuffix(filePath) || '(no extension)';

    counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  );
};
