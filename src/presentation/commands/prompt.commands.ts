import type { PromptOutputDataSource } from '../../domain/datasources/prompt-output.datasource';
import type { IgnoreDecision } from '../../domain/entities/ignore-reason.enum';
import type {
  PromptBuild,
  PromptChangeEntry
} from '../../domain/entities/prompt-payload.entity';
import type { SelectionSnapshot } from '../../domain/entities/selection-snapshot.entity';
import type { DeliverPromptUseCase } from '../../domain/use-cases/prompt/deliver-prompt.use-case';
import type { GeneratePromptUseCase } from '../../domain/use-cases/prompt/generate-prompt.use-case';
import type { SavePromptDialogOptions } from '../pickers/save-prompt.dialog';
import type {
  createDetailsSource,
  createPreviewSource
} from '../views/prompt-preview.source';

import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { OperationKind } from '../../domain/entities/operation-kind.enum';
import { OutputFormat } from '../../domain/entities/output-format.enum';
import { PathKind } from '../../domain/entities/path-kind.enum';
import {
  formatOperationReport,
  isEmptySelection,
  type createDetailBook
} from '../../domain/services/operation-report.service';
import {
  languageIdFor,
  type OutputFormat as OutputFormatType
} from '../../domain/services/prompt-formats.service';
import {
  defaultPromptFileName,
  fileFiltersForFormat
} from '../../domain/services/saved-prompt-file.service';
import {
  overLimitNotice,
  type LimitNotice
} from '../../domain/services/selection-budget.service';
import { FileOutputDataSource } from '../../infrastructure/datasources/file-output.datasource';
import {
  dedupeResolved,
  filesSelectedByFolderAsync
} from '../../infrastructure/filesystem/select-files.walker';
import {
  copyStatusMessage,
  previewStatusMessage,
  saveStatusMessage
} from '../messages/user-messages';
import { promptSaveDestination } from '../pickers/save-prompt.dialog';

export interface PromptForcedRoot {
  pattern: string;
  sourceFile: string;
}

export interface PromptExcludedDecision {
  reason?: string;
  pattern?: string;
  sourceFile?: string;
}

export interface PromptSelectionPort {
  getCheckedFiles: () => string[];
  omittedFolders: () => string[];
  promptChangeList: () => PromptChangeEntry[];
  forcedRootFor: (path: string) => PromptForcedRoot | undefined;
  explain: (relativePath: string, kind: PathKind) => IgnoreDecision;
  resolvePath: (relativePath: string, kind: PathKind) => IgnoreDecision;
}

export interface PromptHistoryPort {
  record: (snapshot: SelectionSnapshot) => void;
}

export type SaveDestinationPicker = (
  options?: SavePromptDialogOptions
) => Promise<vscode.Uri | undefined>;

export type FileOutputFactory = (uri: vscode.Uri) => PromptOutputDataSource;

export interface PromptCommandDeps {
  workspaceRoot: string;
  generatePrompt: GeneratePromptUseCase;
  deliverPrompt: DeliverPromptUseCase;
  clipboard: PromptOutputDataSource;
  selection: PromptSelectionPort;
  history: PromptHistoryPort;
  saveHistory: () => Thenable<void> | void;
  currentSnapshot: () => SelectionSnapshot;
  detailBook: ReturnType<typeof createDetailBook>;
  detailsSource: ReturnType<typeof createDetailsSource>;
  detailsEmitter: vscode.EventEmitter<vscode.Uri>;
  previewSource: ReturnType<typeof createPreviewSource>;
  previewEmitter: vscode.EventEmitter<vscode.Uri>;
  previewUri: vscode.Uri;
  detailsUri: vscode.Uri;
  detailsChannel: vscode.OutputChannel;
  confirmExcluded: (
    filePath: string,
    relative: string,
    decision: PromptExcludedDecision
  ) => Promise<boolean>;
  saveDestinationPicker?: SaveDestinationPicker;
  createFileOutput?: FileOutputFactory;
}

export interface DeliverCollectedOptions {
  includeSystemMessage?: boolean;
  format?: OutputFormat;
  destinationUri?: vscode.Uri;
}

const resolveCommandUris = (
  commandUri: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined
): vscode.Uri[] => {
  if (selected && selected.length > 0) {
    return selected;
  }

  if (commandUri) {
    return [commandUri];
  }

  return [];
};

const resolveReportKind = (
  stop: string,
  destinationUri?: vscode.Uri
): OperationKind => {
  if (stop === 'user-cancelled') {
    return OperationKind.Cancelled;
  }

  if (destinationUri) {
    return OperationKind.Save;
  }

  return OperationKind.Copy;
};

export const registerPromptCommands = (
  deps: PromptCommandDeps
): vscode.Disposable[] => {
  const openReport = async (report: string) => {
    deps.detailsSource.set(report);
    deps.detailsEmitter.fire(deps.detailsUri);
    const document = await vscode.workspace.openTextDocument(deps.detailsUri);

    await vscode.window.showTextDocument(document, { preview: true });
  };

  const rememberReport = (
    kind: OperationKind,
    summary: PromptBuild,
    wrote: boolean
  ) => {
    const manualIncludes = (summary.included ?? [])
      .map(file => {
        const root = deps.selection.forcedRootFor(file.name);

        return root
          ? {
              path: file.name,
              pattern: root.pattern,
              sourceFile: root.sourceFile
            }
          : undefined;
      })
      .filter((item): item is NonNullable<typeof item> => item !== undefined);

    const changeNotes = deps.selection
      .promptChangeList()
      .map(change =>
        [
          `Change: ${change.repo}`,
          change.scope ?? '',
          change.base ?? '',
          change.head ?? '',
          change.path
        ]
          .filter(Boolean)
          .join(' ')
      );

    const report = [
      formatOperationReport({
        kind,
        summary,
        wrote,
        manualIncludes
      }),
      ...changeNotes
    ].join('\n');

    deps.detailsChannel.appendLine(report);
    deps.detailsChannel.appendLine('');

    return deps.detailBook.save(report);
  };

  const deliverCollected = async (
    filePaths: string[],
    output: PromptOutputDataSource,
    options: DeliverCollectedOptions = {}
  ) => {
    const includeSystemMessage = options.includeSystemMessage ?? true;
    const format = options.format;
    const destinationUri = options.destinationUri;

    if (
      isEmptySelection(filePaths, deps.selection.omittedFolders()) &&
      deps.selection.promptChangeList().length === 0
    ) {
      vscode.window.showWarningMessage(vscode.l10n.t('No files selected.'));

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

    const notice: LimitNotice = overLimitNotice({
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

    let currentBuild: PromptBuild | undefined;
    const progressTitle = destinationUri
      ? vscode.l10n.t('Saving prompt')
      : vscode.l10n.t('Copying prompt');

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: true
      },
      async (_progress, token) => {
        const deliverResult = await deps.deliverPrompt.execute(
          {
            filePaths,
            includeSystemMessage,
            format,
            isCancelled: () => token.isCancellationRequested
          },
          output
        );

        currentBuild = deliverResult.build;

        return deliverResult;
      }
    );

    if (!result.started) {
      vscode.window.showWarningMessage(
        vscode.l10n.t('A copy is already in progress.')
      );

      return;
    }

    const summary = currentBuild;

    if (!summary) {
      return;
    }

    const reportKind = resolveReportKind(summary.stop, destinationUri);
    const reportId = rememberReport(reportKind, summary, result.wrote);
    const report = deps.detailBook.open(reportId) ?? '';

    if (summary.stop === 'user-cancelled') {
      const detailsLabel = vscode.l10n.t('Show details');
      const verb = destinationUri ? 'Saved' : 'Copied';

      vscode.window
        .showWarningMessage(
          `Cancelled. Collected ${summary.included.length}. ${verb} 0.`,
          detailsLabel
        )
        .then(choice => {
          if (choice === detailsLabel) {
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
      vscode.window.showWarningMessage(vscode.l10n.t('No files selected.'));

      return;
    }

    const detailsLabel = vscode.l10n.t('Show details');

    if (destinationUri) {
      const fileName = path.basename(destinationUri.fsPath);
      const status = saveStatusMessage({
        stop: summary.stop,
        included: summary.included.length,
        omittedFiles: summary.omittedFiles.length,
        omittedFolders: summary.omittedFolders.length,
        pending: summary.pending,
        fileName
      });

      const message = vscode.l10n.t(status.message, ...status.args);
      const openLabel = vscode.l10n.t('Open file');

      vscode.window
        .showInformationMessage(message, openLabel, detailsLabel)
        .then(async choice => {
          if (choice === openLabel) {
            const document =
              await vscode.workspace.openTextDocument(destinationUri);

            await vscode.window.showTextDocument(document);
          } else if (choice === detailsLabel) {
            void openReport(report);
          }
        });

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

    vscode.window.showInformationMessage(message, detailsLabel).then(choice => {
      if (choice === detailsLabel) {
        void openReport(report);
      }
    });
  };

  const copyCollected = async (
    filePaths: string[],
    includeSystemMessage = true,
    format?: OutputFormat
  ) =>
    deliverCollected(filePaths, deps.clipboard, {
      includeSystemMessage,
      format
    });

  return [
    vscode.commands.registerCommand('files2prompt.copyFiles', async () => {
      const checkedFiles = deps.selection.getCheckedFiles();

      deps.history.record(deps.currentSnapshot());
      await deps.saveHistory();
      await copyCollected(checkedFiles);
    }),

    vscode.commands.registerCommand('files2prompt.copyAsXml', async () => {
      await copyCollected(
        deps.selection.getCheckedFiles(),
        true,
        OutputFormat.Xml
      );
    }),

    vscode.commands.registerCommand('files2prompt.copyAsMarkdown', async () => {
      await copyCollected(
        deps.selection.getCheckedFiles(),
        true,
        OutputFormat.Markdown
      );
    }),

    vscode.commands.registerCommand('files2prompt.copyAsPlain', async () => {
      await copyCollected(
        deps.selection.getCheckedFiles(),
        true,
        OutputFormat.Plain
      );
    }),

    vscode.commands.registerCommand('files2prompt.copyOpenFiles', async () => {
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
    }),

    vscode.commands.registerCommand(
      'files2prompt.copyExplorerSelection',
      async (_commandUri: vscode.Uri | undefined, selected: vscode.Uri[]) => {
        const uris = resolveCommandUris(_commandUri, selected);
        const collected: string[] = [];

        for (const uri of uris) {
          const filePath = uri.fsPath;

          if (!fs.existsSync(filePath)) {
            continue;
          }

          if (!fs.lstatSync(filePath).isDirectory()) {
            const relative = path.relative(deps.workspaceRoot, filePath);
            const decision = deps.selection.explain(relative, PathKind.File);

            if (!decision.included) {
              const forced = await deps.confirmExcluded(
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

          const relative = path.relative(deps.workspaceRoot, filePath);
          const decision = deps.selection.explain(relative, PathKind.Directory);

          if (!decision.included) {
            const forced = await deps.confirmExcluded(
              filePath,
              relative,
              decision
            );

            if (!forced) {
              continue;
            }
          }

          const result = await filesSelectedByFolderAsync(
            deps.workspaceRoot,
            filePath,
            (relative, kind) =>
              deps.selection.resolvePath(relative, kind as PathKind)
          );

          collected.push(...result.files);
        }

        await copyCollected(dedupeResolved(collected));
      }
    ),

    vscode.commands.registerCommand('files2prompt.showDetails', async () => {
      const latest = deps.detailBook.latest();

      if (!latest) {
        deps.detailsChannel.show(true);

        return;
      }

      await openReport(latest);
    }),

    vscode.commands.registerCommand('files2prompt.previewPrompt', async () => {
      deps.history.record(deps.currentSnapshot());
      await deps.saveHistory();

      const summary = await deps.generatePrompt.execute({
        filePaths: deps.selection.getCheckedFiles()
      });

      deps.previewSource.set(summary.xml);
      deps.previewEmitter.fire(deps.previewUri);
      const document = await vscode.workspace.openTextDocument(deps.previewUri);

      await vscode.languages.setTextDocumentLanguage(
        document,
        languageIdFor(
          vscode.workspace
            .getConfiguration('files2prompt')
            .get<OutputFormatType>('outputFormat', OutputFormat.Xml)
        )
      );

      await vscode.window.showTextDocument(document, { preview: true });

      const reportId = rememberReport(OperationKind.Preview, summary, false);
      const report = deps.detailBook.open(reportId) ?? '';

      const previewNotice = previewStatusMessage({
        stop: summary.stop,
        included: summary.included.length,
        pending: summary.pending
      });

      const detailsLabel = vscode.l10n.t('Show details');

      vscode.window
        .showInformationMessage(
          vscode.l10n.t(previewNotice.message, ...previewNotice.args),
          detailsLabel
        )
        .then(choice => {
          if (choice === detailsLabel) {
            void openReport(report);
          }
        });
    }),

    vscode.commands.registerCommand(
      'files2prompt.savePromptAs',
      async (formatOverride?: OutputFormat) => {
        const checkedFiles = deps.selection.getCheckedFiles();

        if (
          isEmptySelection(checkedFiles, deps.selection.omittedFolders()) &&
          deps.selection.promptChangeList().length === 0
        ) {
          vscode.window.showWarningMessage(vscode.l10n.t('No files selected.'));

          return;
        }

        const format =
          formatOverride ??
          vscode.workspace
            .getConfiguration('files2prompt')
            .get<OutputFormatType>('outputFormat', OutputFormat.Xml);

        const fileName = defaultPromptFileName(format);
        const defaultUri = vscode.Uri.file(
          path.join(deps.workspaceRoot, fileName)
        );

        const filters = fileFiltersForFormat(format);

        const picker = deps.saveDestinationPicker ?? promptSaveDestination;
        const destination = await picker({
          defaultUri,
          filters,
          title: vscode.l10n.t('Save prompt as…')
        });

        if (!destination) {
          return;
        }

        deps.history.record(deps.currentSnapshot());
        await deps.saveHistory();

        const fileOutput = deps.createFileOutput
          ? deps.createFileOutput(destination)
          : new FileOutputDataSource(destination);

        await deliverCollected(checkedFiles, fileOutput, {
          includeSystemMessage: true,
          format: format as OutputFormat,
          destinationUri: destination
        });
      }
    )
  ];
};
