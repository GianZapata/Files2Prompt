import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { applyPastedXml } from './applyPastedXml';
import { buildPrompt } from './buildPrompt';
import { createCopyGate } from './copyGate';
import {
  extensionCounts,
  filterByExtensions,
  parseExtensionList
} from './extensionFilter';
import { FileTreeProvider } from './fileTreeProvider';
import {
  discoverRepositories,
  gitUnavailableMessage,
  noRepositoriesMessage,
  recordsFromGitApi,
  type GitApiLike
} from './gitRepos';
import {
  dedupeResolved,
  filesSelectedByFolderAsync
} from './ignore/selectFiles';
import {
  createDetailBook,
  formatOperationReport,
  isEmptySelection
} from './operationReport';
import { createPreviewSource, PREVIEW_SCHEME } from './promptPreview';
import { runCopy, runPreview } from './promptRun';
import { formatByteSize, overLimitNotice } from './selectionBudget';
import {
  createSelectionHistory,
  type SelectionSnapshot
} from './selectionHistory';
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
        maxFiles: config.get<number>('maxFiles', 5000)
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
      const manualIncludes = (built.included ?? [])
        .map(file => {
          const root = fileTreeProvider.forcedRootFor(file.name);

          return root
            ? {
                path: file.name,
                pattern: root.pattern,
                sourceFile: root.sourceFile
              }
            : undefined;
        })
        .filter((item): item is NonNullable<typeof item> => item !== undefined);
      const report = formatOperationReport({
        kind,
        summary: built,
        wrote,
        manualIncludes
      });

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

      const limits = vscode.workspace.getConfiguration('files2prompt');
      let byteCount = 0;

      for (const filePath of filePaths) {
        try {
          byteCount += (await fs.promises.stat(filePath)).size;
        } catch {
          continue;
        }
      }

      const notice = overLimitNotice({
        fileCount: filePaths.length,
        byteCount,
        maxFiles: limits.get<number>('maxFiles', 5000),
        maxTotalBytes: limits.get<number>('maxTotalBytes', 8388608)
      });

      if (notice.over) {
        const copyFits = vscode.l10n.t('Copy what fits');
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t(notice.message, ...notice.args),
          { modal: true },
          copyFits,
          vscode.l10n.t('Cancel')
        );

        if (choice !== copyFits) {
          return;
        }
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
      entries: Array<string[] | SelectionSnapshot>;
      position: number;
    }>('files2prompt.selectionHistory');
    const history = createSelectionHistory(
      stored?.entries ?? [],
      stored?.position ?? -1
    );
    const currentSnapshot = (): SelectionSnapshot => ({
      files: fileTreeProvider.getCheckedFiles(),
      forcedRoots: fileTreeProvider.forcedRootList()
    });
    let descriptionTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDescription = () => {
      if (descriptionTimer) {
        clearTimeout(descriptionTimer);
      }

      descriptionTimer = setTimeout(() => {
        void fileTreeProvider.selectionStats().then(stats => {
          treeView.description = vscode.l10n.t(
            '{0} files · {1}',
            stats.count,
            formatByteSize(stats.bytes)
          );
        });
      }, 200);
    };
    context.subscriptions.push(
      watchGitRepositories(workspaceRoot, fileTreeProvider)
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

        history.record(currentSnapshot());
        await saveHistory();
        await copyCollected(checkedFiles);
      }),
      vscode.commands.registerCommand('files2prompt.clearChecks', async () => {
        history.record(currentSnapshot());
        fileTreeProvider.clearChecks();
        history.record(currentSnapshot());
        await saveHistory();
        vscode.window.showInformationMessage('All checks have been cleared.');
      }),
      vscode.commands.registerCommand('files2prompt.goBack', async () => {
        const previousSelection = history.back();

        if (previousSelection) {
          await saveHistory();
          fileTreeProvider.setForcedRoots(previousSelection.forcedRoots);
          await fileTreeProvider.setCheckedFiles(previousSelection.files);
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
          fileTreeProvider.setForcedRoots(nextSelection.forcedRoots);
          await fileTreeProvider.setCheckedFiles(nextSelection.files);
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
          const collected: string[] = [];

          for (const uri of uris) {
            const filePath = uri.fsPath;

            if (!fs.existsSync(filePath)) {
              continue;
            }

            if (!fs.lstatSync(filePath).isDirectory()) {
              const relative = path.relative(workspaceRoot, filePath);
              const decision = fileTreeProvider.explain(relative, 'file');

              if (!decision.included) {
                const forced = await confirmExcluded(
                  fileTreeProvider,
                  filePath,
                  relative,
                  decision
                );

                if (!forced) {
                  continue;
                }
              }

              collected.push(filePath);
              continue;
            }

            const relative = path.relative(workspaceRoot, filePath);
            const decision = fileTreeProvider.explain(relative, 'directory');

            if (!decision.included) {
              const forced = await confirmExcluded(
                fileTreeProvider,
                filePath,
                relative,
                decision
              );

              if (!forced) {
                continue;
              }
            }

            const result = await filesSelectedByFolderAsync(
              workspaceRoot,
              filePath,
              fileTreeProvider.resolvePath.bind(fileTreeProvider)
            );

            collected.push(...result.files);
          }

          await copyCollected(dedupeResolved(collected));
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
          history.record(currentSnapshot());
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
      ),
      vscode.commands.registerCommand('files2prompt.selectAll', async () => {
        const outcome = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t('Selecting files'),
            cancellable: true
          },
          async (_progress, token) =>
            fileTreeProvider.selectFolder(workspaceRoot, {
              isCancelled: () => token.isCancellationRequested
            })
        );

        if (outcome === 'cancelled') {
          return;
        }

        history.record(currentSnapshot());
        await saveHistory();
        scheduleDescription();
      }),
      vscode.commands.registerCommand(
        'files2prompt.selectByExtension',
        async (target?: vscode.Uri | { resourceUri?: vscode.Uri }) => {
          const folderPath = folderFromTarget(target, workspaceRoot);
          const listed = await filesSelectedByFolderAsync(
            workspaceRoot,
            folderPath,
            fileTreeProvider.resolvePath.bind(fileTreeProvider)
          );
          const relative = listed.files.map(filePath =>
            path.relative(workspaceRoot, filePath).split(path.sep).join('/')
          );
          const presets = vscode.workspace
            .getConfiguration('files2prompt')
            .get<Record<string, string[]>>('extensionPresets', {});
          const picked = await vscode.window.showQuickPick(
            [
              ...Object.entries(presets).map(([name, suffixes]) => ({
                label: name,
                description: suffixes.join(', '),
                suffixes
              })),
              ...extensionCounts(relative).map(([suffix, count]) => ({
                label: `${suffix} (${count})`,
                description: String(count),
                suffixes: [suffix === '(no extension)' ? '' : suffix]
              })),
              {
                label: vscode.l10n.t('Type a list…'),
                description: 'md, ts, php',
                suffixes: [] as string[]
              }
            ],
            {
              canPickMany: true,
              placeHolder: vscode.l10n.t('Choose extensions')
            }
          );

          if (!picked || picked.length === 0) {
            return;
          }

          let suffixes = picked.flatMap(item => item.suffixes);

          if (picked.some(item => item.suffixes.length === 0)) {
            const typed = await vscode.window.showInputBox({
              prompt: vscode.l10n.t('Type extensions, for example md, ts, php')
            });

            if (typed) {
              suffixes = [...suffixes, ...parseExtensionList(typed)];
            }
          }

          if (suffixes.length === 0) {
            return;
          }

          const mode = await vscode.window.showQuickPick(
            [
              {
                label: vscode.l10n.t('Add to selection'),
                id: 'add'
              },
              {
                label: vscode.l10n.t('Replace selection'),
                id: 'replace'
              }
            ],
            { placeHolder: vscode.l10n.t('How should this selection apply?') }
          );

          if (!mode) {
            return;
          }

          const matched = filterByExtensions(relative, suffixes).map(file =>
            path.join(workspaceRoot, file)
          );

          if (mode.id === 'replace') {
            fileTreeProvider.clearChecks();
          }

          await fileTreeProvider.setCheckedFiles([
            ...(mode.id === 'add' ? fileTreeProvider.getCheckedFiles() : []),
            ...matched
          ]);
          history.record(currentSnapshot());
          await saveHistory();
          scheduleDescription();
        }
      )
    );

    context.subscriptions.push(
      treeView.onDidChangeCheckboxState(async event => {
        for (const [item, state] of event.items) {
          const relative = path
            .relative(workspaceRoot, item.resourceUri.fsPath)
            .split(path.sep)
            .join('/');
          const kind = item.isDirectory ? 'directory' : 'file';

          if (state === vscode.TreeItemCheckboxState.Unchecked) {
            fileTreeProvider.removeForcedRoot(relative);
            await fileTreeProvider.updateCheckState(item, state);
            continue;
          }

          const decision = fileTreeProvider.explain(relative, kind);

          if (!decision.included) {
            const forced = await confirmExcluded(
              fileTreeProvider,
              item.resourceUri.fsPath,
              relative,
              decision
            );

            if (!forced) {
              await fileTreeProvider.updateCheckState(
                item,
                vscode.TreeItemCheckboxState.Unchecked
              );
              continue;
            }
          }

          if (item.isDirectory) {
            const outcome = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Selecting files'),
                cancellable: true
              },
              async (_progress, token) =>
                fileTreeProvider.selectFolder(item.resourceUri.fsPath, {
                  isCancelled: () => token.isCancellationRequested
                })
            );

            if (outcome === 'cancelled') {
              await fileTreeProvider.updateCheckState(
                item,
                vscode.TreeItemCheckboxState.Unchecked
              );
            }
          } else {
            await fileTreeProvider.updateCheckState(item, state);
          }
        }

        history.record(currentSnapshot());
        await saveHistory();
        scheduleDescription();
      })
    );
  } else {
    vscode.window.showInformationMessage(
      'Please open a workspace folder to use this extension.'
    );
  }
}

export function deactivate() {}

const watchGitRepositories = (
  workspaceRoot: string,
  provider: FileTreeProvider
) => {
  const disposable = new vscode.Disposable(() => undefined);
  const gitExtension = vscode.extensions.getExtension('vscode.git');

  if (!gitExtension) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t(gitUnavailableMessage())
    );

    return disposable;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let reportedEmpty = false;
  const subscriptions: vscode.Disposable[] = [];
  const refresh = (api: GitApiLike) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      const found = discoverRepositories(
        workspaceRoot,
        recordsFromGitApi(api),
        relative =>
          relative === '' ||
          provider.explain(relative, 'directory').included ||
          provider.forcedRootFor(relative) !== undefined
      );

      provider.setRepositories(found);

      if (found.length === 0 && !reportedEmpty) {
        reportedEmpty = true;
        void vscode.window.showInformationMessage(
          vscode.l10n.t(noRepositoriesMessage())
        );
      }
    }, 200);
  };

  void gitExtension.activate().then(exports => {
    const api = (exports as { getAPI: (version: 1) => GitApiLike }).getAPI(1);

    refresh(api);
    subscriptions.push(
      api.onDidOpenRepository(() => refresh(api)),
      api.onDidCloseRepository(() => refresh(api))
    );

    for (const repository of api.repositories) {
      subscriptions.push(repository.state.onDidChange(() => refresh(api)));
    }
  });

  return new vscode.Disposable(() => {
    if (timer) {
      clearTimeout(timer);
    }

    for (const item of subscriptions) {
      item.dispose();
    }
  });
};

const folderFromTarget = (
  target: vscode.Uri | { resourceUri?: vscode.Uri } | undefined,
  workspaceRoot: string
) => {
  if (target instanceof vscode.Uri) {
    return fs.existsSync(target.fsPath) &&
      fs.lstatSync(target.fsPath).isDirectory()
      ? target.fsPath
      : path.dirname(target.fsPath);
  }

  if (target?.resourceUri) {
    return target.resourceUri.fsPath;
  }

  return workspaceRoot;
};

const confirmExcluded = async (
  provider: {
    explain: (
      relativePath: string,
      kind: 'file' | 'directory'
    ) => { reason?: string; pattern?: string; sourceFile?: string };
    countIfForced: (
      folderPath: string,
      root: { relativePath: string; pattern: string; sourceFile: string }
    ) => Promise<number>;
    addForcedRoot: (root: {
      relativePath: string;
      pattern: string;
      sourceFile: string;
    }) => void;
  },
  folderPath: string,
  relativePath: string,
  decision: { reason?: string; pattern?: string; sourceFile?: string }
) => {
  if (
    decision.reason === 'promptignore' ||
    decision.reason === 'built-in' ||
    decision.reason === 'binary'
  ) {
    const message =
      decision.reason === 'promptignore'
        ? vscode.l10n.t(
            '{0} is excluded by .promptignore, so it stays out of the prompt.',
            relativePath
          )
        : vscode.l10n.t(
            '{0} stays out of the prompt because it is generated or binary.',
            relativePath
          );

    await vscode.window.showWarningMessage(message);

    return false;
  }

  if (
    decision.reason !== 'gitignore' &&
    decision.reason !== 'workspace-exclude'
  ) {
    await vscode.window.showWarningMessage(
      vscode.l10n.t('{0} stays out of the prompt.', relativePath)
    );

    return false;
  }

  const root = {
    relativePath: relativePath.replace(/\\/g, '/').replace(/\/$/, ''),
    pattern: decision.pattern ?? relativePath,
    sourceFile: decision.sourceFile ?? '.gitignore'
  };
  const count = fs.lstatSync(folderPath).isDirectory()
    ? await provider.countIfForced(folderPath, root)
    : 1;
  const include = vscode.l10n.t('Include');
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t(
      '{0} is listed in {1}. Include its {2} files anyway?',
      relativePath,
      root.sourceFile,
      count
    ),
    { modal: true },
    include,
    vscode.l10n.t('Cancel')
  );

  if (choice !== include) {
    return false;
  }

  provider.addForcedRoot(root);

  return true;
};

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
