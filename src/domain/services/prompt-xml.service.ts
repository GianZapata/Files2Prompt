import type {
  PromptChangeEntry,
  PromptFile,
  PromptPayload
} from '../entities/prompt-payload.entity';

export type { PromptChangeEntry, PromptFile, PromptPayload };

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeCdata = (value: string) =>
  value.split(']]>').join(']]]]><![CDATA[>');

const cdata = (value: string) => `<![CDATA[${escapeCdata(value)}]]>`;

export const serializedSystemMessage = (message: string) =>
  `<systemMessage>${cdata(message)}</systemMessage>`;

export const serializedFile = (file: PromptFile) =>
  `<file name="${escapeAttribute(file.name)}">${cdata(file.content)}</file>`;

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
            `status="${escapeAttribute(change.status.toLowerCase())}"`,
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

export const serializePrompt = (input: PromptPayload) => {
  const message =
    input.systemMessage && input.systemMessage.length > 0
      ? serializedSystemMessage(input.systemMessage)
      : '';
  const files = input.files.map(serializedFile).join('');
  const changes = serializeChanges(input.changes ?? []);

  return `<files>${message}${changes}${files}</files>`;
};
