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
import { createPreviewSource, PREVIEW_SCHEME } from './promptPreview';
import { runCopy, runPreview } from './promptRun';
import { createSelectionHistory } from './selectionHistory';
import { copyStatusMessage, pasteStatusMessage } from './userMessages';

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

      const status = copyStatusMessage({
        stop: summary.stop,
        included: summary.included.length,
        omittedFiles: summary.omittedFiles.length,
        omittedFolders: summary.omittedFolders.length,
        pending: summary.pending
      });
      const message = vscode.l10n.t(status.message, ...status.args);

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

    const previewSource = createPreviewSource();
    const previewEmitter = new vscode.EventEmitter<vscode.Uri>();
    const previewUri = vscode.Uri.parse(previewSource.uri);

    context.subscriptions.push(
      fileTreeProvider,
      treeView,
      previewEmitter,
      vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
        onDidChange: previewEmitter.event,
        provideTextDocumentContent: () => previewSource.get()
      })
    );

    const stored = context.workspaceState.get<{
      entries: string[][];
      position: number;
    }>('files2prompt.selectionHistory');
    const history = createSelectionHistory(
      stored?.entries ?? [],
      stored?.position ?? -1
    );
    const saveHistory = () =>
      context.workspaceState.update('files2prompt.selectionHistory', {
        entries: history.entries().slice(-20),
        position: history.position()
      });

    context.subscriptions.push(
      vscode.commands.registerCommand('files2prompt.refresh', () =>
        fileTreeProvider.refresh()
      ),
      vscode.commands.registerCommand('files2prompt.copyFiles', async () => {
        const checkedFiles = fileTreeProvider.getCheckedFiles();

        history.record(checkedFiles);
        await saveHistory();
        await copyCollected(checkedFiles);
      }),
      vscode.commands.registerCommand('files2prompt.clearChecks', async () => {
        history.record(fileTreeProvider.getCheckedFiles());
        fileTreeProvider.clearChecks();
        history.record([]);
        await saveHistory();
        vscode.window.showInformationMessage('All checks have been cleared.');
      }),
      vscode.commands.registerCommand('files2prompt.goBack', async () => {
        const previousSelection = history.back();

        if (previousSelection) {
          await saveHistory();
          await fileTreeProvider.setCheckedFiles(previousSelection);
        } else {
          vscode.window.showWarningMessage(
            'No previous selection to go back to.'
          );
        }
      }),
      vscode.commands.registerCommand('files2prompt.goForward', async () => {
        const nextSelection = history.forward();

        if (nextSelection) {
          await saveHistory();
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
          history.record(fileTreeProvider.getCheckedFiles());
          await saveHistory();
          const preview = await runPreview({
            clipboard: {
              read: () => 'preview-must-not-write',
              write: () => undefined
            },
            build: () => collectPrompt(fileTreeProvider.getCheckedFiles()),
            summarize: selectionSummary
          });

          previewSource.set(preview.summary.xml);
          previewEmitter.fire(previewUri);
          const document = await vscode.workspace.openTextDocument(previewUri);

          await vscode.languages.setTextDocumentLanguage(document, 'xml');
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

    context.subscriptions.push(
      treeView.onDidChangeCheckboxState(async event => {
        for (const [item, state] of event.items) {
          await fileTreeProvider.updateCheckState(item, state);
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
    const pasteStatus = pasteStatusMessage(applied.reason);

    vscode.window.showErrorMessage(
      vscode.l10n.t(pasteStatus.message, ...pasteStatus.args)
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
