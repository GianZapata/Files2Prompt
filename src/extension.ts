import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { createCopyGate } from './copyGate';
import { DiscoverGitRepositories } from './domain/use-cases/git/discover-git-repositories.use-case';
import { GetGitChanges } from './domain/use-cases/git/get-git-changes.use-case';
import { DeliverPrompt } from './domain/use-cases/prompt/deliver-prompt.use-case';
import { GeneratePrompt } from './domain/use-cases/prompt/generate-prompt.use-case';
import {
  extensionCounts,
  extensionPickItems,
  filterByExtensions
} from './extensionFilter';
import { ExtensionsProvider } from './extensionsProvider';
import { FileTreeProvider } from './fileTreeProvider';
import { GitChangesProvider } from './gitChangesProvider';
import {
  discoverRepositories,
  gitUnavailableMessage,
  noRepositoriesMessage,
  recordsFromGitApi,
  type DiscoveredRepository,
  type GitApiLike
} from './gitRepos';
import { filesSelectedByFolderAsync } from './ignore/selectFiles';
import { ClipboardOutputDataSource } from './infrastructure/datasources/clipboard-output.datasource';
import { NodeWorkspaceFilesDataSource } from './infrastructure/datasources/node-workspace-files.datasource';
import { VscodeGitDataSource } from './infrastructure/datasources/vscode-git.datasource';
import { VscodeSettingsDataSource } from './infrastructure/datasources/vscode-settings.datasource';
import { GitChangesRepositoryImpl } from './infrastructure/repositories/git-changes.repository.impl';
import { PromptRepositoryImpl } from './infrastructure/repositories/prompt.repository.impl';
import { createDetailBook } from './operationReport';
import { registerGitCommands } from './presentation/commands/git.commands';
import { registerPromptCommands } from './presentation/commands/prompt.commands';
import {
  createDetailsSource,
  createPreviewSource,
  DETAILS_SCHEME,
  PREVIEW_SCHEME
} from './promptPreview';
import {
  changeBadge,
  changeStatusLabel,
  type PromptChange
} from './selectChanges';
import {
  formatByteSize,
  nextOutputFormat,
  outputFormatLabel,
  selectionStatus,
  shouldConfirmIgnored,
  shouldRefreshSummary
} from './selectionBudget';
import {
  createSelectionHistory,
  type SelectionSnapshot
} from './selectionHistory';
import { syncChangeCheck, syncExtensionCheck } from './sideViews';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (workspaceFolders) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fileTreeProvider = new FileTreeProvider(workspaceRoot);
    const copyGate = createCopyGate();
    const details = vscode.window.createOutputChannel('Files2Prompt');
    const detailBook = createDetailBook();

    const filesDataSource = new NodeWorkspaceFilesDataSource();
    const settingsDataSource = new VscodeSettingsDataSource();
    const promptRepository = new PromptRepositoryImpl(
      workspaceRoot,
      filesDataSource,
      settingsDataSource,
      fileTreeProvider
    );
    const generatePrompt = new GeneratePrompt(promptRepository);
    const deliverPrompt = new DeliverPrompt(promptRepository, copyGate);
    const clipboardOutput = new ClipboardOutputDataSource();

    const detailsSource = createDetailsSource();
    const detailsEmitter = new vscode.EventEmitter<vscode.Uri>();
    const detailsUri = vscode.Uri.parse(detailsSource.uri);

    const gitChanges = new GitChangesProvider();
    const treeView = vscode.window.createTreeView('files2PromptView', {
      treeDataProvider: fileTreeProvider,
      manageCheckboxStateManually: true
    });
    const gitChangesView = vscode.window.createTreeView(
      'files2prompt.gitChanges',
      {
        treeDataProvider: gitChanges,
        manageCheckboxStateManually: true
      }
    );
    const extensions = new ExtensionsProvider();
    const extensionsView = vscode.window.createTreeView(
      'files2prompt.extensions',
      {
        treeDataProvider: extensions,
        manageCheckboxStateManually: true
      }
    );
    let extensionTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshExtensions = () => {
      if (extensionTimer) {
        clearTimeout(extensionTimer);
      }

      extensionTimer = setTimeout(() => {
        void filesSelectedByFolderAsync(
          workspaceRoot,
          workspaceRoot,
          fileTreeProvider.resolvePath.bind(fileTreeProvider)
        ).then(listed => {
          const available = listed.files.map(filePath =>
            path.relative(workspaceRoot, filePath).split(path.sep).join('/')
          );
          const selected = fileTreeProvider
            .getCheckedFiles()
            .map(filePath =>
              path.relative(workspaceRoot, filePath).split(path.sep).join('/')
            );

          extensions.setFiles(available, selected);
        });
      }, 200);
    };

    refreshExtensions();
    const publishChanges = (changes: PromptChange[]) => {
      fileTreeProvider.setPromptChanges(changes);
      gitChanges.setListed(changes);
      gitChanges.setIncluded(changes);
    };

    const gitDataSource = new VscodeGitDataSource();
    const gitChangesRepository = new GitChangesRepositoryImpl(
      workspaceRoot,
      gitDataSource
    );
    const getGitChanges = new GetGitChanges(gitChangesRepository);
    const discoverRepositories = new DiscoverGitRepositories(
      gitChangesRepository
    );

    const previewSource = createPreviewSource();
    const previewEmitter = new vscode.EventEmitter<vscode.Uri>();
    const previewUri = vscode.Uri.parse(previewSource.uri);

    context.subscriptions.push(
      fileTreeProvider,
      treeView,
      gitChangesView,
      extensionsView,
      previewEmitter,
      detailsEmitter,
      vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
        onDidChange: previewEmitter.event,
        provideTextDocumentContent: () => previewSource.get()
      }),
      vscode.workspace.registerTextDocumentContentProvider(DETAILS_SCHEME, {
        onDidChange: detailsEmitter.event,
        provideTextDocumentContent: () => detailsSource.get()
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
      forcedRoots: fileTreeProvider.forcedRootList(),
      promptChanges: fileTreeProvider.promptChangeList()
    });
    const selectionItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );

    selectionItem.command = 'files2prompt.changeOutputFormat';
    selectionItem.name = vscode.l10n.t('Files2Prompt selection');
    let descriptionTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDescription = () => {
      if (descriptionTimer) {
        clearTimeout(descriptionTimer);
      }

      descriptionTimer = setTimeout(() => {
        void fileTreeProvider.selectionStats().then(stats => {
          const byteLabel = formatByteSize(stats.bytes);
          const changes = fileTreeProvider.promptChangeList();
          const status = selectionStatus({
            fileCount: stats.count,
            byteLabel,
            changeCount: changes.length,
            repositoryCount: new Set(changes.map(change => change.repo)).size,
            format: vscode.workspace
              .getConfiguration('files2prompt')
              .get<string>('outputFormat', 'xml')
          });

          treeView.description = vscode.l10n.t(
            '{0} files · {1}',
            stats.count,
            byteLabel
          );
          selectionItem.text = status.text;
          selectionItem.tooltip = status.tooltip;
          selectionItem.accessibilityInformation = {
            label: status.accessibility,
            role: 'button'
          };
          selectionItem.show();
        });
      }, 200);
    };

    context.subscriptions.push(
      selectionItem,
      vscode.window.registerFileDecorationProvider({
        onDidChangeFileDecorations: fileTreeProvider.onDidChangeDecorations,
        provideFileDecoration: uri => {
          const relative = path
            .relative(workspaceRoot, uri.fsPath)
            .split(path.sep)
            .join('/');
          const change = fileTreeProvider
            .promptChangeList()
            .find(item => item.path === relative);

          if (!change) {
            return undefined;
          }

          const badge = changeBadge(change.status);
          const word = changeStatusLabel(change.status);

          return new vscode.FileDecoration(
            badge,
            vscode.l10n.t('{0} in the Git changes', word),
            new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
          );
        }
      })
    );
    scheduleDescription();

    context.subscriptions.push(
      watchGitRepositories(workspaceRoot, fileTreeProvider, found =>
        gitChanges.setRepositories(found)
      )
    );
    const ignoredPrompt = () => ({
      confirm: shouldConfirmIgnored({
        setting: vscode.workspace
          .getConfiguration('files2prompt')
          .get<boolean>('confirmIgnoredFolders', true),
        remembered:
          context.workspaceState.get('files2prompt.skipIgnoredConfirm') === true
      }),
      remember: () =>
        context.workspaceState.update('files2prompt.skipIgnoredConfirm', true)
    });
    const saveHistory = () =>
      context.workspaceState.update('files2prompt.selectionHistory', {
        entries: history.entries().slice(-20),
        position: history.position()
      });

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'files2prompt.changeOutputFormat',
        async () => {
          const current = vscode.workspace
            .getConfiguration('files2prompt')
            .get<string>('outputFormat', 'xml');
          const picked = await vscode.window.showQuickPick(
            (['xml', 'markdown', 'plain'] as const).map(format => ({
              label: vscode.l10n.t(outputFormatLabel(format)),
              description:
                format === current ? vscode.l10n.t('Current') : undefined,
              format
            })),
            {
              placeHolder: vscode.l10n.t('Choose the output format')
            }
          );
          const next = nextOutputFormat(current, picked?.format);

          if (!next.changed || next.wroteClipboard) {
            return;
          }

          await vscode.workspace
            .getConfiguration('files2prompt')
            .update(
              'outputFormat',
              next.format,
              vscode.ConfigurationTarget.Workspace
            );
          scheduleDescription();
        }
      ),
      vscode.workspace.onDidChangeConfiguration(event => {
        const section = 'files2prompt.outputFormat';

        if (
          event.affectsConfiguration(section) &&
          shouldRefreshSummary(section)
        ) {
          scheduleDescription();
        }
      }),
      vscode.commands.registerCommand('files2prompt.refresh', () =>
        fileTreeProvider.refresh()
      ),
      ...registerPromptCommands({
        workspaceRoot,
        generatePrompt,
        deliverPrompt,
        clipboard: clipboardOutput,
        selection: fileTreeProvider,
        history,
        saveHistory,
        currentSnapshot,
        detailBook,
        detailsSource,
        detailsEmitter,
        previewSource,
        previewEmitter,
        previewUri,
        detailsUri,
        detailsChannel: details,
        confirmExcluded: (filePath, relative, decision) =>
          confirmExcluded(
            fileTreeProvider,
            filePath,
            relative,
            decision,
            ignoredPrompt()
          )
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
          publishChanges(previousSelection.promptChanges);
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
          publishChanges(nextSelection.promptChanges);
          await fileTreeProvider.setCheckedFiles(nextSelection.files);
        } else {
          vscode.window.showWarningMessage(
            'No next selection to go forward to.'
          );
        }
      }),
      ...registerGitCommands({
        workspaceRoot,
        gitRepository: gitChangesRepository,
        getGitChanges,
        discoverRepositories,
        fileSelection: fileTreeProvider,
        publishChanges,
        recordHistory: () => history.record(currentSnapshot()),
        saveHistory,
        scheduleDescription
      }),
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
          const detected = [
            ...Object.entries(presets).map(([name, suffixes]) => ({
              label: name,
              description: suffixes.join(', '),
              suffixes
            })),
            ...extensionCounts(relative).map(([suffix, count]) => ({
              label: `${suffix} (${count})`,
              description: String(count),
              suffixes: [suffix === '(no extension)' ? '' : suffix]
            }))
          ];
          const picked = await new Promise<
            Array<{ suffixes: string[] }> | undefined
          >(resolve => {
            const pick = vscode.window.createQuickPick<
              vscode.QuickPickItem & { suffixes: string[] }
            >();
            let settled = false;
            const finish = (
              value: Array<{ suffixes: string[] }> | undefined
            ) => {
              if (settled) return;

              settled = true;
              pick.dispose();
              resolve(value);
            };

            pick.canSelectMany = true;
            pick.placeholder = vscode.l10n.t(
              'Select several or type md, ts, php'
            );
            pick.items = detected;
            pick.onDidChangeValue(value => {
              pick.items = extensionPickItems(detected, value);
            });
            pick.onDidAccept(() => {
              finish([...pick.selectedItems]);
            });
            pick.onDidHide(() => {
              finish(undefined);
            });
            pick.show();
          });

          if (!picked || picked.length === 0) {
            return;
          }

          const suffixes = picked.flatMap(item => item.suffixes);

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
              decision,
              ignoredPrompt()
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
      }),
      gitChangesView.onDidChangeCheckboxState(async event => {
        for (const [item, state] of event.items) {
          if (!item.change) {
            continue;
          }

          const selected = fileTreeProvider
            .getCheckedFiles()
            .map(filePath =>
              path.relative(workspaceRoot, filePath).split(path.sep).join('/')
            );
          const next = syncChangeCheck({
            checked: state === vscode.TreeItemCheckboxState.Checked,
            change: item.change,
            selectedFiles: selected,
            promptChanges: fileTreeProvider.promptChangeList()
          });

          fileTreeProvider.setPromptChanges(next.changes);
          gitChanges.setIncluded(next.changes);
          await fileTreeProvider.setCheckedFiles(
            next.files.map(filePath => path.join(workspaceRoot, filePath))
          );
        }

        history.record(currentSnapshot());
        await saveHistory();
        scheduleDescription();
      }),

      extensionsView.onDidChangeCheckboxState(async event => {
        const available = extensions.availableFiles();
        let selected = fileTreeProvider
          .getCheckedFiles()
          .map(filePath =>
            path.relative(workspaceRoot, filePath).split(path.sep).join('/')
          );

        for (const [item, state] of event.items) {
          selected = syncExtensionCheck({
            checked: state === vscode.TreeItemCheckboxState.Checked,
            suffix: item.suffix,
            available,
            selected
          });
        }

        await fileTreeProvider.setCheckedFiles(
          selected.map(filePath => path.join(workspaceRoot, filePath))
        );
        extensions.setFiles(available, selected);
        history.record(currentSnapshot());
        await saveHistory();
        scheduleDescription();
      }),
      fileTreeProvider.onDidChangeTreeData(() => {
        refreshExtensions();
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
  provider: FileTreeProvider,
  onRepositories?: (found: DiscoveredRepository[]) => void
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
      onRepositories?.(found);

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
  decision: { reason?: string; pattern?: string; sourceFile?: string },
  prompt: {
    confirm: boolean;
    remember: () => Thenable<void>;
  } = { confirm: true, remember: async () => undefined }
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

  if (!prompt.confirm) {
    provider.addForcedRoot(root);

    return true;
  }

  const include = vscode.l10n.t('Include');
  const remember = vscode.l10n.t(
    'Include and do not ask again in this project'
  );
  const choice = await vscode.window.showWarningMessage(
    vscode.l10n.t(
      '{0} is listed in {1}. Include its {2} files anyway?',
      relativePath,
      root.sourceFile,
      count
    ),
    { modal: true },
    include,
    remember,
    vscode.l10n.t('Cancel')
  );

  if (choice === remember) {
    await prompt.remember();
    provider.addForcedRoot(root);

    return true;
  }

  if (choice !== include) {
    return false;
  }

  provider.addForcedRoot(root);

  return true;
};
