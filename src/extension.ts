import type { PromptChange } from './domain/entities/git-change.entity';
import type {
  SelectionHistoryState,
  SelectionSnapshot
} from './domain/entities/selection-snapshot.entity';

import * as path from 'path';

import * as vscode from 'vscode';

import { createCopyGate } from './domain/services/copy-gate.service';
import { createDetailBook } from './domain/services/operation-report.service';
import {
  SAVED_PROMPTS_KEY,
  createSavedPromptRegistry,
  savedPromptRelativePath
} from './domain/services/saved-prompt-registry.service';
import { shouldConfirmIgnored } from './domain/services/selection-budget.service';
import { SKIP_TOKEN_NOTICE_KEY } from './domain/services/selection-budget.service';
import { createSelectionHistory } from './domain/services/selection-history.service';
import { DiscoverGitRepositories } from './domain/use-cases/git/discover-git-repositories.use-case';
import { GetGitChanges } from './domain/use-cases/git/get-git-changes.use-case';
import { DeliverPrompt } from './domain/use-cases/prompt/deliver-prompt.use-case';
import { GeneratePrompt } from './domain/use-cases/prompt/generate-prompt.use-case';
import { RecordSelection } from './domain/use-cases/selection/record-selection.use-case';
import { ClipboardOutputDataSource } from './infrastructure/datasources/clipboard-output.datasource';
import { NodeWorkspaceFilesDataSource } from './infrastructure/datasources/node-workspace-files.datasource';
import { VscodeGitDataSource } from './infrastructure/datasources/vscode-git.datasource';
import { VscodeSettingsDataSource } from './infrastructure/datasources/vscode-settings.datasource';
import { WorkspaceStateDataSource } from './infrastructure/datasources/workspace-state.datasource';
import { filesSelectedByFolderAsync } from './infrastructure/filesystem/select-files.walker';
import { GitChangesRepositoryImpl } from './infrastructure/repositories/git-changes.repository.impl';
import { PromptRepositoryImpl } from './infrastructure/repositories/prompt.repository.impl';
import { registerGitCommands } from './presentation/commands/git.commands';
import { registerHistoryCommands } from './presentation/commands/history.commands';
import { registerPromptCommands } from './presentation/commands/prompt.commands';
import { registerSelectionCommands } from './presentation/commands/selection.commands';
import { confirmExcluded } from './presentation/pickers/exclusion.prompt';
import { createSelectionStatusBar } from './presentation/status/selection-status.bar';
import { ExtensionsProvider } from './presentation/views/extensions.provider';
import { FileTreeProvider } from './presentation/views/file-tree.provider';
import { GitChangesProvider } from './presentation/views/git-changes.tree-provider';
import { registerGitFileDecoration } from './presentation/views/git-file-decoration.provider';
import { createPromptVirtualDocuments } from './presentation/views/prompt-virtual-documents.provider';
import { watchGitRepositories } from './presentation/watchers/git-repositories.watcher';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    vscode.window.showInformationMessage(
      'Please open a workspace folder to use this extension.'
    );

    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const stateDataSource = new WorkspaceStateDataSource(context.workspaceState);
  const savedPrompts = createSavedPromptRegistry(
    stateDataSource.get<string[]>(SAVED_PROMPTS_KEY) ?? []
  );

  const fileTreeProvider = new FileTreeProvider(workspaceRoot, savedPrompts);
  const copyGate = createCopyGate();
  const details = vscode.window.createOutputChannel('Promptfold');
  const detailBook = createDetailBook();

  const filesDataSource = new NodeWorkspaceFilesDataSource();
  const settingsDataSource = new VscodeSettingsDataSource();
  const gitDataSource = new VscodeGitDataSource();
  const clipboardOutput = new ClipboardOutputDataSource();

  const promptRepository = new PromptRepositoryImpl(
    workspaceRoot,
    filesDataSource,
    settingsDataSource,
    fileTreeProvider
  );

  const gitChangesRepository = new GitChangesRepositoryImpl(
    workspaceRoot,
    gitDataSource
  );

  const generatePrompt = new GeneratePrompt(promptRepository);
  const deliverPrompt = new DeliverPrompt(promptRepository, copyGate);
  const getGitChanges = new GetGitChanges(gitChangesRepository);
  const discoverRepositories = new DiscoverGitRepositories(
    gitChangesRepository
  );

  const virtualDocs = createPromptVirtualDocuments();
  const gitChanges = new GitChangesProvider();
  const treeView = vscode.window.createTreeView('promptfoldView', {
    treeDataProvider: fileTreeProvider,
    manageCheckboxStateManually: true
  });

  const gitChangesView = vscode.window.createTreeView('promptfold.gitChanges', {
    treeDataProvider: gitChanges,
    manageCheckboxStateManually: true
  });

  const extensions = new ExtensionsProvider();
  const extensionsView = vscode.window.createTreeView('promptfold.extensions', {
    treeDataProvider: extensions,
    manageCheckboxStateManually: true
  });

  const statusBar = createSelectionStatusBar({
    fileTreeProvider,
    treeView
  });

  const stored = stateDataSource.get<SelectionHistoryState>(
    'promptfold.selectionHistory'
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

  const recordSelection = new RecordSelection(
    history,
    stateDataSource,
    statusBar.scheduleDescription
  );

  const saveHistory = async () => {
    await stateDataSource.update('promptfold.selectionHistory', {
      entries: history.entries().slice(-20),
      position: history.position()
    });
  };

  const registerSavedPrompt = async (filePath: string) => {
    const relative = savedPromptRelativePath(workspaceRoot, filePath);

    if (relative === undefined) {
      return;
    }

    savedPrompts.register(relative);
    await stateDataSource.update(SAVED_PROMPTS_KEY, savedPrompts.list());
    fileTreeProvider.refresh();
  };

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

  const ignoredPrompt = () => ({
    confirm: shouldConfirmIgnored({
      setting: vscode.workspace
        .getConfiguration('promptfold')
        .get<boolean>('confirmIgnoredFolders', true),
      remembered:
        context.workspaceState.get('promptfold.skipIgnoredConfirm') === true
    }),
    remember: () =>
      context.workspaceState.update('promptfold.skipIgnoredConfirm', true)
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('promptfold.tokenBudget')) {
        void stateDataSource.update(SKIP_TOKEN_NOTICE_KEY, undefined);
      }
    }),
    fileTreeProvider,
    treeView,
    gitChangesView,
    extensionsView,
    ...virtualDocs.disposables,
    ...statusBar.disposables,
    registerGitFileDecoration(workspaceRoot, fileTreeProvider),
    watchGitRepositories(workspaceRoot, fileTreeProvider, found =>
      gitChanges.setRepositories(found)
    ),
    vscode.commands.registerCommand('promptfold.refresh', () =>
      fileTreeProvider.refresh()
    ),
    ...registerPromptCommands({
      workspaceRoot,
      generatePrompt,
      deliverPrompt,
      clipboard: clipboardOutput,
      selection: fileTreeProvider,
      state: stateDataSource,
      registerSavedPrompt,
      history,
      saveHistory,
      currentSnapshot,
      detailBook,
      detailsSource: virtualDocs.detailsSource,
      detailsEmitter: virtualDocs.detailsEmitter,
      previewSource: virtualDocs.previewSource,
      previewEmitter: virtualDocs.previewEmitter,
      detailsUri: virtualDocs.detailsUri,
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
      scheduleDescription: statusBar.scheduleDescription
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

  statusBar.scheduleDescription();
}

export function deactivate() {}
