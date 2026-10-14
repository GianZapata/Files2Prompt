import fs from 'fs';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';

import * as vscode from 'vscode';

import {
  activateExtension,
  waitForRepositories,
  workspaceRoot
} from './support/extension';
import {
  withStubs,
  type QuickPickAnswer,
  type WindowRecording
} from './support/window-stubs';

const PICK_REPOSITORIES = 'Choose repositories';
const PICK_SCOPE = 'Which changes should be selected?';
const PICK_MODE = 'How should this selection apply?';

const CHANGED_PATHS = [
  'api/src/index.ts',
  'web/docs/guía de uso.md',
  'web/notas rápidas.txt'
];

const PROMPT_FILE_NAME = /^prompt-\d{4}-\d{2}-\d{2}-\d{4}\.(md|txt|xml)$/;

const uncommittedReplace = (
  placeHolder: string | undefined,
  items: readonly vscode.QuickPickItem[]
): QuickPickAnswer => {
  if (placeHolder === PICK_REPOSITORIES) {
    return items;
  }

  if (placeHolder === PICK_SCOPE) {
    return items.find(item => Reflect.get(item, 'scope') === 'uncommitted');
  }

  if (placeHolder === PICK_MODE) {
    return items.find(item => Reflect.get(item, 'id') === 'replace');
  }

  return undefined;
};

const copyWith = async (command: string) => {
  await vscode.env.clipboard.writeText('');
  await vscode.commands.executeCommand(command);

  return vscode.env.clipboard.readText();
};

const savePromptTo = (target: vscode.Uri) =>
  withStubs(
    { pickFor: uncommittedReplace, saveUri: target },
    async (recording: WindowRecording) => {
      await vscode.commands.executeCommand('files2prompt.savePromptAs');

      return recording;
    }
  );

describe('Files2Prompt with two git repositories', () => {
  let outputDirectory: string;

  before(async () => {
    await activateExtension();
    await waitForRepositories(2);

    outputDirectory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'f2p-out-')
    );
  });

  after(() => {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  });

  it('selects the uncommitted changes of both repositories', async () => {
    await withStubs({ pickFor: uncommittedReplace }, () =>
      vscode.commands.executeCommand('files2prompt.selectChanges')
    );

    const xml = await withStubs({}, () => copyWith('files2prompt.copyAsXml'));

    for (const changed of CHANGED_PATHS) {
      assert.ok(xml.includes(`<file name="${changed}">`), `${changed} missing`);
      assert.ok(xml.includes(`path="${changed}"`), `${changed} diff missing`);
    }

    assert.ok(xml.includes('repo="api"'));
    assert.ok(xml.includes('repo="web"'));
  });

  it('copies the selection as XML', async () => {
    const xml = await withStubs({}, () => copyWith('files2prompt.copyAsXml'));

    assert.ok(xml.startsWith('<files>'));
    assert.ok(xml.endsWith('</files>'));
    assert.ok(xml.includes('Segunda versión con acción.'));
    assert.ok(xml.includes('export const version = 2;'));
    assert.equal(xml.includes('\r'), false);
  });

  it('copies the selection as Markdown', async () => {
    const markdown = await withStubs({}, () =>
      copyWith('files2prompt.copyAsMarkdown')
    );

    assert.ok(markdown.includes('## Git changes — web'));
    assert.ok(markdown.includes('### web/docs/guía de uso.md'));
    assert.ok(markdown.includes('Segunda versión con acción.'));
    assert.equal(markdown.includes('<files>'), false);
    assert.equal(markdown.includes('\r'), false);
  });

  it('copies the selection as plain text', async () => {
    const plain = await withStubs({}, () =>
      copyWith('files2prompt.copyAsPlain')
    );

    assert.ok(plain.includes('=== FILE web/docs/guía de uso.md ==='));
    assert.ok(
      plain.includes('=== DIFF web/docs/guía de uso.md (modified) ===')
    );

    assert.ok(plain.includes('Revisar el diseño.'));
    assert.equal(plain.includes('<files>'), false);
    assert.equal(plain.includes('\r'), false);
  });

  it('saves the prompt as Markdown when the chosen file is .md', async () => {
    const target = vscode.Uri.file(path.join(outputDirectory, 'resultado.md'));
    const recording = await savePromptTo(target);
    const saved = fs.readFileSync(target.fsPath, 'utf8');
    const [options] = recording.saveOptions;

    assert.ok(saved.includes('## Git changes — web'));
    assert.ok(saved.includes('### web/docs/guía de uso.md'));
    assert.equal(saved.includes('<files>'), false);
    assert.deepEqual(Object.keys(options.filters ?? {}), [
      'XML',
      'Markdown',
      'Text Files'
    ]);

    assert.equal(
      path
        .dirname(options.defaultUri?.fsPath ?? '')
        .startsWith(workspaceRoot()),
      false
    );

    assert.match(
      path.basename(options.defaultUri?.fsPath ?? ''),
      PROMPT_FILE_NAME
    );

    assert.ok(
      recording.messages.some(
        entry =>
          entry.message.includes('resultado.md') &&
          entry.actions.includes('Open') &&
          entry.actions.length === 3
      )
    );
  });

  it('saves the prompt as plain text when the chosen file is .txt', async () => {
    const target = vscode.Uri.file(path.join(outputDirectory, 'resultado.txt'));

    await savePromptTo(target);

    const saved = fs.readFileSync(target.fsPath, 'utf8');

    assert.ok(saved.includes('=== FILE web/docs/guía de uso.md ==='));
    assert.equal(saved.includes('<files>'), false);
  });

  it('copies the prompt as a file in the temp folder and reveals it', async () => {
    const recording = await withStubs({}, async stubs => {
      await vscode.commands.executeCommand('files2prompt.copyAsFile');

      return stubs;
    });

    const [revealed] = recording.revealed;
    const written = fs.readFileSync(revealed.fsPath, 'utf8');

    assert.equal(
      path.dirname(revealed.fsPath),
      path.join(os.tmpdir(), 'files2prompt')
    );

    assert.match(path.basename(revealed.fsPath), PROMPT_FILE_NAME);
    assert.ok(written.startsWith('<files>'));
    assert.ok(written.includes('Segunda versión con acción.'));
  });

  it('keeps a prompt saved inside the workspace out of later selections', async () => {
    const target = vscode.Uri.file(
      path.join(workspaceRoot(), 'out', 'guardado.md')
    );

    await savePromptTo(target);
    assert.ok(fs.existsSync(target.fsPath));

    await vscode.commands.executeCommand('files2prompt.clearChecks');
    await withStubs({}, () =>
      vscode.commands.executeCommand('files2prompt.selectAll')
    );

    const xml = await withStubs({}, () => copyWith('files2prompt.copyAsXml'));

    assert.ok(xml.includes('<file name="web/src/app.ts">'));
    assert.equal(xml.includes('out/guardado.md'), false);
  });
});
