import { XMLParser } from 'fast-xml-parser';

export type PromptFile = {
  name: string;
  content: string;
};

export type PromptChangeEntry = {
  repo: string;
  path: string;
  status: string;
  scope?: string;
  base?: string;
  head?: string;
  from?: string;
  to?: string;
  binary?: boolean;
  diff?: string;
};

export type PromptPayload = {
  systemMessage?: string;
  files: PromptFile[];
  changes?: PromptChangeEntry[];
};

export type ParsePromptResult =
  | { ok: true; payload: PromptPayload }
  | {
      ok: false;
      reason: 'invalid' | 'empty' | 'missing-cdata';
      paths: string[];
    };

const parser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: '__cdata',
  trimValues: false
});

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeCdata = (value: string) =>
  value.split(']]>').join(']]]]><![CDATA[>');

const cdata = (value: string) => `<![CDATA[${escapeCdata(value)}]]>`;

export const serializedFile = (file: PromptFile) =>
  `<file name="${escapeAttribute(file.name)}">${cdata(file.content)}</file>`;

export const serializePrompt = (input: PromptPayload) => {
  const parts: string[] = [];

  if (input.systemMessage && input.systemMessage.length > 0) {
    parts.push(`<systemMessage>${cdata(input.systemMessage)}</systemMessage>`);
  }

  const files = input.files.map(serializedFile).join('');
  const changes = serializeChanges(input.changes ?? []);

  return `<files>${parts.join('')}${changes}${files}</files>`;
};

export const serializeChanges = (changes: PromptChangeEntry[]) => {
  const groups = new Map<string, PromptChangeEntry[]>();

  for (const change of changes) {
    const key = [change.repo, change.scope, change.base, change.head].join(
      '\0'
    );
    const group = groups.get(key) ?? [];

    group.push(change);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(group => {
      const first = group[0];
      const attrs = [
        `repo="${escapeAttribute(first.repo)}"`,
        first.scope ? `scope="${escapeAttribute(first.scope)}"` : '',
        first.base ? `base="${escapeAttribute(first.base)}"` : '',
        first.head ? `head="${escapeAttribute(first.head)}"` : ''
      ]
        .filter(Boolean)
        .join(' ');
      const body = group
        .map(change => {
          const changeAttrs = [
            `path="${escapeAttribute(change.path)}"`,
            `status="${escapeAttribute(change.status)}"`,
            change.from ? `from="${escapeAttribute(change.from)}"` : '',
            change.to ? `to="${escapeAttribute(change.to)}"` : '',
            change.binary ? 'binary="true"' : ''
          ]
            .filter(Boolean)
            .join(' ');

          if (change.binary || !change.diff) {
            return `<change ${changeAttrs}/>`;
          }

          return `<change ${changeAttrs}>${cdata(change.diff)}</change>`;
        })
        .join('');

      return `<changes ${attrs}>${body}</changes>`;
    })
    .join('');
};

const textOf = (node: unknown): string => {
  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }

  if (node && typeof node === 'object') {
    const record = node as { __cdata?: unknown; '#text'?: unknown };

    if (record.__cdata !== undefined) {
      return textOf(record.__cdata);
    }

    if (record['#text'] !== undefined) {
      return textOf(record['#text']);
    }
  }

  return '';
};

const isEntirelyCdata = (file: Record<string, unknown>) => {
  const keys = Object.keys(file).filter(key => key !== '@_name');

  if (keys.length === 0 || keys.some(key => key !== '__cdata')) {
    return false;
  }

  return file.__cdata !== undefined;
};

export const parsePrompt = (xml: string): ParsePromptResult => {
  let parsed: {
    files?: {
      file?: unknown;
      systemMessage?: unknown;
    };
  };

  try {
    parsed = parser.parse(xml);
  } catch {
    return { ok: false, reason: 'invalid', paths: [] };
  }

  if (!parsed?.files?.file) {
    return { ok: false, reason: 'empty', paths: [] };
  }

  const rawFiles = Array.isArray(parsed.files.file)
    ? parsed.files.file
    : [parsed.files.file];
  const missing: string[] = [];
  const files: PromptFile[] = [];

  for (const raw of rawFiles) {
    const file = (raw ?? {}) as Record<string, unknown>;
    const name = typeof file['@_name'] === 'string' ? file['@_name'] : '';

    if (!name || !isEntirelyCdata(file)) {
      missing.push(name || '(unnamed)');

      continue;
    }

    files.push({ name, content: textOf(file.__cdata) });
  }

  if (missing.length > 0) {
    return { ok: false, reason: 'missing-cdata', paths: missing };
  }

  const systemMessage = parsed.files.systemMessage
    ? textOf(parsed.files.systemMessage)
    : undefined;

  return { ok: true, payload: { systemMessage, files } };
};

export const parseFiles = (xml: string) => {
  const parsed = parsePrompt(xml);

  return parsed.ok ? parsed.payload.files : undefined;
};
