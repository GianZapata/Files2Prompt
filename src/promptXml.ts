import { XMLParser } from 'fast-xml-parser';

export type PromptFile = {
  name: string;
  content: string;
};

export type PromptPayload = {
  systemMessage?: string;
  files: PromptFile[];
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

  return `<files>${parts.join('')}${files}</files>`;
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
