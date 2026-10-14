import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OutputFormat } from '../src/domain/entities/output-format.enum';
import {
  defaultPromptFileName,
  fileFiltersForFormat,
  formatFileExtension
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

test('saved-prompt-file: provides save dialog filters per format', () => {
  const mdFilters = fileFiltersForFormat(OutputFormat.Markdown);

  assert.deepEqual(mdFilters.Markdown, ['md']);
  assert.deepEqual(mdFilters['All Files'], ['*']);

  const txtFilters = fileFiltersForFormat(OutputFormat.Plain);

  assert.deepEqual(txtFilters['Text Files'], ['txt']);
  assert.deepEqual(txtFilters['All Files'], ['*']);

  const xmlFilters = fileFiltersForFormat(OutputFormat.Xml);

  assert.deepEqual(xmlFilters.XML, ['xml']);
  assert.deepEqual(xmlFilters['All Files'], ['*']);
});
