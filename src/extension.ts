import type { PromptChange } from './domain/entities/git-change.entity';
import type {
  SelectionHistoryState,
  SelectionSnapshot
} from './domain/entities/selection-snapshot.entity';
import type { DiscoveredRepository, GitApiLike } from './gitRepos';

import * as path from 'path';

import * as vscode from 'vscode';

import { createCopyGate } from './copyGate';
import {
  changeBadge,
  changeStatusLabel
} from './domain/services/git-changes.service';
import {
  discoverRepositories,
  gitUnavailableMessage,
  noRepositoriesMessage,
  recordsFromGitApi
} from './domain/services/git-repos.service';
import { createSelectionHistory } from './domain/services/selection-history.service';
import { DiscoverGitRepositories } from './domain/use-cases/git/discover-git-repositories.use-case';
import { GetGitChanges } from './domain/use-cases/git/get-git-changes.use-case';
import { DeliverPrompt } from './domain/use-cases/prompt/deliver-prompt.use-case';
import { GeneratePrompt } from './domain/use-cases/prompt/generate-prompt.use-case';
import { RecordSelection } from './domain/use-cases/selection/record-selection.use-case';
import { filesSelectedByFolderAsync } from './ignore/selectFiles';
import { ClipboardOutputDataSource } from './infrastructure/datasources/clipboard-output.datasource';
import { NodeWorkspaceFilesDataSource } from './infrastructure/datasources/node-workspace-files.datasource';
import { VscodeGitDataSource } from './infrastructure/datasources/vscode-git.datasource';
import { VscodeSettingsDataSource } from './infrastructure/datasources/vscode-settings.datasource';
import { WorkspaceStateDataSource } from './infrastructure/datasources/workspace-state.datasource';
import { GitChangesRepositoryImpl } from './infrastructure/repositories/git-changes.repository.impl';
import { PromptRepositoryImpl } from './infrastructure/repositories/prompt.repository.impl';
import { createDetailBook } from './operationReport';
import { registerGitCommands } from './presentation/commands/git.commands';
import { registerHistoryCommands } from './presentation/commands/history.commands';
import { registerPromptCommands } from './presentation/commands/prompt.commands';
import { registerSelectionCommands } from './presentation/commands/selection.commands';
import { confirmExcluded } from './presentation/pickers/exclusion.prompt';
import { ExtensionsProvider } from './presentation/views/extensions.provider';
import { FileTreeProvider } from './presentation/views/file-tree.provider';
import { GitChangesProvider } from './presentation/views/git-changes.tree-provider';
import {
  createDetailsSource,
  createPreviewSource,
  DETAILS_SCHEME,
  PREVIEW_SCHEME
} from './promptPreview';
import {
  formatByteSize,
  nextOutputFormat,
  outputFormatLabel,
  selectionStatus,
  shouldConfirmIgnored,
  shouldRefreshSummary
} from './selectionBudget';

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
    const stateDataSource = new WorkspaceStateDataSource(
      context.workspaceState
    );

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

    const stored = stateDataSource.get<SelectionHistoryState>(
      'files2prompt.selectionHistory'
    );

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

    const recordSelection = new RecordSelection(
      history,
      stateDataSource,
      scheduleDescription
    );

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

    const saveHistory = async () => {
      await stateDataSource.update('files2prompt.selectionHistory', {
        entries: history.entries().slice(-20),
        position: history.position()
      });
    };

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
      ...registerGitCommands({
        workspaceRoot,
        gitRepository: gitChangesRepository,
        getGitChanges,
        discoverRepositories,
        fileSelection: fileTreeProvider,
        publishChanges,
        recordHistory: () => {
          void recordSelection.execute({ snapshot: currentSnapshot() });
        },
        saveHistory,
        scheduleDescription
      }),
      ...registerHistoryCommands({
        history,
        saveHistory,
        fileTreeProvider,
        publishChanges
      }),
      ...registerSelectionCommands({
        workspaceRoot,
        fileTreeProvider,
        treeView,
        gitChanges,
        gitChangesView,
        extensions,
        extensionsView,
        recordSelection,
        currentSnapshot,
        confirmExcluded: (provider, folderPath, relative, decision) =>
          confirmExcluded(
            provider,
            folderPath,
            relative,
            decision,
            ignoredPrompt()
          ),
        refreshExtensions
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
