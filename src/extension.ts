import * as fs from 'fs';

import * as vscode from 'vscode';

import { applyPastedXml } from './applyPastedXml';
import { buildPrompt } from './buildPrompt';
import { createCopyGate } from './copyGate';
import { FileTreeProvider } from './fileTreeProvider';
import { dedupeResolved, filesSelectedByFolder } from './ignore/selectFiles';
import {
  createDetailBook,
  formatOperationReport,
  isEmptySelection
} from './operationReport';
import { runCopy, runPreview } from './promptRun';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fileTreeProvider = new FileTreeProvider(workspaceRoot);
    const copyGate = createCopyGate();
    const details = vscode.window.createOutputChannel('Files2Prompt');
    const detailBook = createDetailBook();

    context.subscriptions.push(details);

    const collectPrompt = (
      filePaths: string[],
      cancelled = () => false,
      includeSystemMessage = true
    ) => {
      const config = vscode.workspace.getConfiguration('files2prompt');

      return buildPrompt({
        workspaceRoot,
        filePaths,
        systemMessage: includeSystemMessage
          ? config.get<string>('systemMessage')
          : undefined,
        resolve: (relativePath, kind) =>
          fileTreeProvider.resolvePath(relativePath, kind),
        openText: openTextFor,
        isCancelled: cancelled,
        maxFileBytes: config.get<number>('maxFileBytes', 1048576),
        maxTotalBytes: config.get<number>('maxTotalBytes', 8388608),
        maxFiles: 5000
      });
    };

    const selectionSummary = (
      built: Awaited<ReturnType<typeof collectPrompt>>
    ) => ({
      ...built,
      omittedFolders: [
        ...new Set([
          ...built.omittedFolders,
          ...fileTreeProvider.omittedFolders()
        ])
      ].sort()
    });

    const rememberReport = (
      kind: 'copy' | 'preview' | 'cancelled',
      built: Awaited<ReturnType<typeof collectPrompt>>,
      wrote: boolean
    ) => {
      const report = formatOperationReport({ kind, summary: built, wrote });

      details.appendLine(report);
      details.appendLine('');

      return detailBook.save(report);
    };

    const openReport = async (report: string) => {
      const document = await vscode.workspace.openTextDocument({
        content: report
      });

      await vscode.window.showTextDocument(document, { preview: true });
    };

    const copyCollected = async (
      filePaths: string[],
      includeSystemMessage = true
    ) => {
      if (isEmptySelection(filePaths, fileTreeProvider.omittedFolders())) {
        vscode.window.showWarningMessage('No files selected.');

        return;
      }

      const result = await runCopy({
        gate: copyGate,
        clipboard: {
          read: () => '',
          write: text => vscode.env.clipboard.writeText(text)
        },
        summarize: selectionSummary,
        build: cancelled =>
          collectPrompt(filePaths, cancelled, includeSystemMessage),
        withProgress: work =>
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Copying prompt',
              cancellable: true
            },
            (_progress, token) => work(() => token.isCancellationRequested)
          )
      });

      if (!result.started) {
        vscode.window.showWarningMessage('A copy is already in progress.');

        return;
      }

      const summary = result.summary;

      if (!summary) {
        return;
      }

      const reportId = rememberReport(
        summary.stop === 'user-cancelled' ? 'cancelled' : 'copy',
        summary,
        result.wrote
      );
      const report = detailBook.open(reportId) ?? '';

      if (summary.stop === 'user-cancelled') {
        vscode.window
          .showWarningMessage(
            `Cancelled. Collected ${summary.included.length}. Copied 0. Clipboard not written.`,
            'Ver detalles'
          )
          .then(choice => {
            if (choice === 'Ver detalles') {
              void openReport(report);
            }
          });

        return;
      }

      if (
        summary.included.length === 0 &&
        summary.omittedFiles.length === 0 &&
        summary.omittedFolders.length === 0
      ) {
        vscode.window.showWarningMessage('No files selected.');

        return;
      }

      const message =
        summary.stop === 'completed'
          ? `Copied ${summary.included.length} files. Omitted ${summary.omittedFiles.length} files and ${summary.omittedFolders.length} folders.`
          : `Partial copy (${summary.stop}). Pending ${summary.pending}. Bytes ${summary.byteLength}.`;

      vscode.window
        .showInformationMessage(message, 'Ver detalles')
        .then(choice => {
          if (choice === 'Ver detalles') {
            void openReport(report);
          }
        });
    };

    const treeView = vscode.window.createTreeView('files2PromptView', {
      treeDataProvider: fileTreeProvider,
      manageCheckboxStateManually: true
    });

    context.subscriptions.push(fileTreeProvider);

    let history: string[][] = [];
    let historyPosition: number = -1;

    context.subscriptions.push(
      vscode.commands.registerCommand('files2prompt.refresh', () =>
        fileTreeProvider.refresh()
      ),
      vscode.commands.registerCommand('files2prompt.copyFiles', async () => {
        const checkedFiles = fileTreeProvider.getCheckedFiles();
        const lastSelection = history[historyPosition] || [];

        if (!arraysEqual(checkedFiles, lastSelection)) {
          if (historyPosition < history.length - 1) {
            history = history.slice(0, historyPosition + 1);
          }
          history.push([...checkedFiles]);
          historyPosition++;
        }

        await copyCollected(checkedFiles);
      }),
      vscode.commands.registerCommand('files2prompt.clearChecks', () => {
        fileTreeProvider.clearChecks();
        vscode.window.showInformationMessage('All checks have been cleared.');
      }),
      vscode.commands.registerCommand('files2prompt.goBack', async () => {
        if (historyPosition > 0) {
          historyPosition--;
          const previousSelection = history[historyPosition];

          await fileTreeProvider.setCheckedFiles(previousSelection);
        } else {
          vscode.window.showWarningMessage(
            'No previous selection to go back to.'
          );
        }
      }),
      vscode.commands.registerCommand('files2prompt.goForward', async () => {
        if (historyPosition < history.length - 1) {
          historyPosition++;
          const nextSelection = history[historyPosition];

          await fileTreeProvider.setCheckedFiles(nextSelection);
        } else {
          vscode.window.showWarningMessage(
            'No next selection to go forward to.'
          );
        }
      }),
      vscode.commands.registerCommand(
        'files2prompt.copyExplorerSelection',
        async (_commandUri: vscode.Uri | undefined, selected: vscode.Uri[]) => {
          const uris = selected?.length
            ? selected
            : _commandUri
              ? [_commandUri]
              : [];
          const files = dedupeResolved(
            uris.flatMap(uri => {
              const filePath = uri.fsPath;

              if (!fs.existsSync(filePath)) {
                return [];
              }

              if (fs.lstatSync(filePath).isDirectory()) {
                return filesSelectedByFolder(
                  workspaceRoot,
                  filePath,
                  fileTreeProvider.resolvePath.bind(fileTreeProvider)
                );
              }

              return [filePath];
            })
          );

          await copyCollected(files);
        }
      ),
      vscode.commands.registerCommand('files2prompt.showDetails', async () => {
        const latest = detailBook.latest();

        if (!latest) {
          details.show(true);

          return;
        }

        await openReport(latest);
      }),
      vscode.commands.registerCommand(
        'files2prompt.previewPrompt',
        async () => {
          const preview = await runPreview({
            clipboard: {
              read: () => 'preview-must-not-write',
              write: () => undefined
            },
            build: () => collectPrompt(fileTreeProvider.getCheckedFiles()),
            summarize: selectionSummary
          });

          const document = await vscode.workspace.openTextDocument({
            content: preview.summary.xml,
            language: 'xml'
          });

          await vscode.window.showTextDocument(document, { preview: true });
          const reportId = rememberReport('preview', preview.summary, false);
          const report = detailBook.open(reportId) ?? '';

          vscode.window
            .showInformationMessage('Prompt preview opened.', 'Ver detalles')
            .then(choice => {
              if (choice === 'Ver detalles') {
                void openReport(report);
              }
            });
        }
      ),
      vscode.commands.registerCommand('files2prompt.pasteXml', async () => {
        const clipboardContent = await vscode.env.clipboard.readText();

        await processXmlContent(clipboardContent, details);
      }),
      vscode.commands.registerCommand(
        'files2prompt.copyOpenFiles',
        async () => {
          const tabGroups: ReadonlyArray<vscode.TabGroup> =
            vscode.window.tabGroups.all;

          const files = new Set<string>();

          for (const group of tabGroups) {
            for (const tab of group.tabs) {
              if (tab.input instanceof vscode.TabInputText) {
                files.add(tab.input.uri.fsPath);
              }
            }
          }

          await copyCollected([...files], false);
        }
      )
    );

    treeView.onDidChangeCheckboxState(async e => {
      for (const [item, state] of e.items) {
        await fileTreeProvider.updateCheckState(item, state);
      }
    });

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('files2prompt.systemMessage')) {
          // Handle any dynamic updates if necessary
        }
      })
    );
  } else {
    vscode.window.showInformationMessage(
      'Please open a workspace folder to use this extension.'
    );
  }
}

export function deactivate() {}

const openTextFor = (filePath: string) => {
  const document = vscode.workspace.textDocuments.find(
    item => !item.isUntitled && item.uri.fsPath === filePath
  );

  return document ? document.getText() : undefined;
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) {
      return false;
    }
  }

  return true;
}

async function processXmlContent(
  xmlContent: string,
  details: vscode.OutputChannel
) {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const applied = await applyPastedXml({
    xml: xmlContent,
    workspaceRoot,
    isDirty: absolutePath =>
      vscode.workspace.textDocuments.some(
        document =>
          !document.isUntitled &&
          document.isDirty &&
          document.uri.fsPath === absolutePath
      ),
    exists: fs.existsSync,
    mkdir: async () => undefined,
    write: async (filePath, content) => {
      const uri = vscode.Uri.file(filePath);
      const edit = new vscode.WorkspaceEdit();

      if (fs.existsSync(filePath)) {
        const document = await vscode.workspace.openTextDocument(uri);
        const end = document.positionAt(document.getText().length);

        edit.replace(
          uri,
          new vscode.Range(new vscode.Position(0, 0), end),
          content
        );
      } else {
        edit.createFile(uri, {
          overwrite: false,
          contents: Buffer.from(content, 'utf8')
        });
      }

      await vscode.workspace.applyEdit(edit);
    },
    read: filePath => fs.promises.readFile(filePath, 'utf8'),
    confirm: async changes => {
      const lines = [
        ...changes.created.map(file => `New: ${file}`),
        ...changes.modified.map(file => `Modified: ${file}`)
      ];
      const choice = await vscode.window.showWarningMessage(
        `Apply pasted files?\n${lines.join('\n')}`,
        { modal: true },
        'Aplicar'
      );

      return choice === 'Aplicar';
    }
  });

  if (applied.reason !== 'ok' || !applied.written) {
    vscode.window.showErrorMessage(
      applied.reason === 'empty'
        ? 'No file content found. See documentation for usage.'
        : `Paste stopped (${applied.reason}${applied.paths?.length ? `: ${applied.paths.join(', ')}` : ''}).`
    );

    return;
  }

  const changedFiles = applied.written
    .filter(file => file.existed)
    .map(file => ({
      path: file.relativePath,
      uri: vscode.Uri.file(file.absolutePath)
    }));
  const newFiles = applied.written
    .filter(file => !file.existed)
    .map(file => ({
      path: file.relativePath,
      uri: vscode.Uri.file(file.absolutePath)
    }));

  if (changedFiles.length > 0 || newFiles.length > 0) {
    // Create quick pick items for all changed/new files
    const quickPickItems: Array<vscode.QuickPickItem & { uri: vscode.Uri }> = [
      ...changedFiles.map(f => ({
        label: `📝 ${f.path}`,
        description: 'Modified',
        uri: f.uri
      })),
      ...newFiles.map(f => ({
        label: `✨ ${f.path}`,
        description: 'New',
        uri: f.uri
      }))
    ];

    // Show information message with multiple actions
    vscode.window
      .showInformationMessage(
        `Files have been updated successfully. ${changedFiles.length} modified, ${newFiles.length} new.`,
        'Show Details',
        'Open Changed Files'
      )
      .then(async selection => {
        if (selection === 'Show Details') {
          // Create and show output channel with details and clickable links
          details.clear();

          if (changedFiles.length > 0) {
            details.appendLine('Modified files:');
            changedFiles.forEach(file => {
              details.appendLine(`${file.path}`);
            });
            details.appendLine('');
          }

          if (newFiles.length > 0) {
            details.appendLine('New files:');
            newFiles.forEach(file => {
              details.appendLine(`${file.path}`);
            });
          }

          details.show(true);
        } else if (selection === 'Open Changed Files') {
          // Show quick pick with all changed files
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select files to open',
            canPickMany: true
          });

          if (selected) {
            // Open each selected file
            for (const item of selected) {
              const uri = item.uri;

              if (uri) {
                const doc = await vscode.workspace.openTextDocument(uri);

                await vscode.window.showTextDocument(doc, { preview: false });
              }
            }
          }
        }
      });
  } else {
    vscode.window.showInformationMessage('No files were changed.');
  }
}
