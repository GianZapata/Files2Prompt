import { XMLParser } from 'fast-xml-parser';

export type PromptFile = {
  name: string;
  content: string;
};

export type PromptPayload = {
  systemMessage?: string;
  files: PromptFile[];
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

export const serializePrompt = (input: PromptPayload) => {
  const parts: string[] = [];

  if (input.systemMessage && input.systemMessage.length > 0) {
    parts.push(`<systemMessage>${cdata(input.systemMessage)}</systemMessage>`);
  }

  const files = input.files
    .map(
      file =>
        `<file name="${escapeAttribute(file.name)}">${cdata(file.content)}</file>`
    )
    .join('');

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

export const parsePrompt = (xml: string): PromptPayload | undefined => {
  let parsed: {
    files?: {
      file?: unknown;
      systemMessage?: { __cdata?: string; '#text'?: string } | string;
    };
  };

  try {
    parsed = parser.parse(xml);
  } catch {
    return undefined;
  }

  if (!parsed?.files?.file) {
    return undefined;
  }

  const rawFiles = Array.isArray(parsed.files.file)
    ? parsed.files.file
    : [parsed.files.file];
  const files = rawFiles
    .map(
      file => file as { '@_name'?: string; __cdata?: string; '#text'?: string }
    )
    .filter(file => file['@_name'])
    .map(file => ({
      name: file['@_name'] as string,
      content: textOf(file)
    }));

  const systemMessage = parsed.files.systemMessage
    ? textOf(parsed.files.systemMessage)
    : undefined;

  return { systemMessage, files };
};

export const parseFiles = (xml: string) => parsePrompt(xml)?.files;
