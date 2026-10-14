import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'path';

import { OutputFormat } from '../src/domain/entities/output-format.enum';
import {
  defaultPromptFileName,
  defaultSaveFolder,
  fileFiltersForFormat,
  formatFileExtension,
  formatFromExtension,
  resolveSaveTarget,
  revealLabelFor,
  tempPromptFilePath,
  timestampedPromptFileName
} from '../src/domain/services/saved-prompt-file.service';

test('saved-prompt-file: maps formats to expected file extensions', () => {
  assert.equal(formatFileExtension(OutputFormat.Markdown), 'md');
  assert.equal(formatFileExtension('markdown'), 'md');
  assert.equal(formatFileExtension(OutputFormat.Plain), 'txt');
  assert.equal(formatFileExtension('plain'), 'txt');
  assert.equal(formatFileExtension(OutputFormat.Xml), 'xml');
  assert.equal(formatFileExtension('xml'), 'xml');
});

test('saved-prompt-file: generates default file name', () => {
  assert.equal(defaultPromptFileName(OutputFormat.Markdown), 'prompt.md');
  assert.equal(defaultPromptFileName(OutputFormat.Plain), 'prompt.txt');
  assert.equal(defaultPromptFileName(OutputFormat.Xml), 'prompt.xml');
  assert.equal(
    defaultPromptFileName(OutputFormat.Markdown, 'custom'),
    'custom.md'
  );
});

test('saved-prompt-file: timestamped name uses local date and time', () => {
  const moment = new Date(2026, 9, 14, 8, 5);

  assert.equal(
    timestampedPromptFileName(OutputFormat.Markdown, moment),
    'prompt-2026-10-14-0805.md'
  );

  assert.equal(
    timestampedPromptFileName(OutputFormat.Plain, new Date(2026, 0, 3, 23, 59)),
    'prompt-2026-01-03-2359.txt'
  );

  assert.equal(
    timestampedPromptFileName(OutputFormat.Xml, moment),
    'prompt-2026-10-14-0805.xml'
  );
});

test('saved-prompt-file: the format follows the chosen extension', () => {
  assert.equal(formatFromExtension('/tmp/a.md'), OutputFormat.Markdown);
  assert.equal(formatFromExtension('/tmp/a.markdown'), OutputFormat.Markdown);
  assert.equal(formatFromExtension('/tmp/a.txt'), OutputFormat.Plain);
  assert.equal(formatFromExtension('/tmp/a.xml'), OutputFormat.Xml);
  assert.equal(formatFromExtension('C:\\tmp\\A.MD'), OutputFormat.Markdown);
  assert.equal(formatFromExtension('/tmp/a.json'), undefined);
  assert.equal(formatFromExtension('/tmp/a'), undefined);
  assert.equal(formatFromExtension('/tmp/.md'), undefined);
});

test('saved-prompt-file: save target keeps a known extension and fixes the rest', () => {
  assert.deepEqual(resolveSaveTarget('/out/a.txt', OutputFormat.Xml), {
    format: OutputFormat.Plain,
    filePath: '/out/a.txt'
  });

  assert.deepEqual(resolveSaveTarget('/out/a', OutputFormat.Markdown), {
    format: OutputFormat.Markdown,
    filePath: '/out/a.md'
  });

  assert.deepEqual(resolveSaveTarget('/out/a.prompt', OutputFormat.Xml), {
    format: OutputFormat.Xml,
    filePath: '/out/a.prompt'
  });
});

test('saved-prompt-file: all three filters appear with the setting first', () => {
  assert.deepEqual(Object.keys(fileFiltersForFormat(OutputFormat.Markdown)), [
    'Markdown',
    'Text Files',
    'XML'
  ]);

  assert.deepEqual(Object.keys(fileFiltersForFormat(OutputFormat.Plain)), [
    'Text Files',
    'Markdown',
    'XML'
  ]);

  assert.deepEqual(Object.keys(fileFiltersForFormat(OutputFormat.Xml)), [
    'XML',
    'Markdown',
    'Text Files'
  ]);

  assert.deepEqual(fileFiltersForFormat(OutputFormat.Xml), {
    XML: ['xml'],
    Markdown: ['md'],
    'Text Files': ['txt']
  });
});

test('saved-prompt-file: default folder prefers the last one, then Downloads, then home', () => {
  const home = path.join(path.sep, 'home', 'ana');
  const downloads = path.join(home, 'Downloads');
  const last = path.join(path.sep, 'work', 'prompts');
  const existing =
    (...folders: string[]) =>
    (folder: string) =>
      folders.includes(folder);

  assert.equal(
    defaultSaveFolder({
      lastFolder: last,
      downloads,
      home,
      exists: existing(last, downloads, home)
    }),
    last
  );

  assert.equal(
    defaultSaveFolder({
      lastFolder: last,
      downloads,
      home,
      exists: existing(downloads, home)
    }),
    downloads
  );

  assert.equal(
    defaultSaveFolder({
      downloads,
      home,
      exists: existing(downloads, home)
    }),
    downloads
  );

  assert.equal(
    defaultSaveFolder({ downloads, home, exists: existing(home) }),
    home
  );
});

test('saved-prompt-file: reveal label depends on the platform', () => {
  assert.equal(revealLabelFor('darwin'), 'Reveal in Finder');
  assert.equal(revealLabelFor('win32'), 'Reveal in File Explorer');
  assert.equal(revealLabelFor('linux'), 'Reveal in file manager');
});

test('saved-prompt-file: copy as file lands in a promptfold folder of the temp dir', () => {
  const moment = new Date(2026, 9, 14, 8, 5);

  assert.equal(
    tempPromptFilePath('/tmp', OutputFormat.Markdown, moment, path.posix),
    '/tmp/promptfold/prompt-2026-10-14-0805.md'
  );

  assert.equal(
    tempPromptFilePath(
      'C:\\Users\\ana\\AppData\\Local\\Temp',
      OutputFormat.Xml,
      moment,
      path.win32
    ),
    'C:\\Users\\ana\\AppData\\Local\\Temp\\promptfold\\prompt-2026-10-14-0805.xml'
  );
});
