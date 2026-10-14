import type { SettingsDataSource } from '../../domain/datasources/settings.datasource';
import type { WorkspaceFilesDataSource } from '../../domain/datasources/workspace-files.datasource';
import type { IgnoreDecision } from '../../domain/entities/ignore-reason.enum';
import type { PathKind } from '../../domain/entities/path-kind.enum';
import type {
  OmittedFile,
  PromptBuild,
  PromptChangeEntry,
  PromptFile
} from '../../domain/entities/prompt-payload.entity';

import { CopyStop } from '../../domain/entities/copy-stop.enum';
import { DiffMode } from '../../domain/entities/diff-mode.enum';
import { toPosixRelative } from '../../domain/helpers/to-posix-relative';
import {
  PromptRepository,
  type PromptRequest
} from '../../domain/repositories/prompt.repository';
import { renderPrompt } from '../../domain/services/prompt-formats.service';

export interface PromptPathResolver {
  resolvePath: (
    relativePath: string,
    kind: PathKind | 'file' | 'directory'
  ) => IgnoreDecision;
  omittedFolders?: () => string[];
  promptChangeList?: () => PromptChangeEntry[];
}

export class PromptRepositoryImpl extends PromptRepository {
  constructor(
    private readonly workspaceRoot: string,
    private readonly files: WorkspaceFilesDataSource,
    private readonly settings: SettingsDataSource,
    private readonly resolver: PromptPathResolver
  ) {
    super();
  }

  build = async (request: PromptRequest): Promise<PromptBuild> => {
    const config = this.settings.promptSettings();
    const diffMode = config.diffMode;
    const format = request.format ?? config.outputFormat;
    const isCancelled = request.isCancelled ?? (() => false);

    const filePaths = diffMode === DiffMode.DiffOnly ? [] : request.filePaths;
    const changes =
      diffMode === DiffMode.FilesOnly
        ? []
        : (request.changes ?? this.resolver.promptChangeList?.() ?? []);

    const systemMessage =
      (request.includeSystemMessage ?? true) ? config.systemMessage : undefined;

    const included: PromptFile[] = [];
    const omittedFiles: OmittedFile[] = [];
    const omittedFolders: string[] = [
      ...new Set(this.resolver.omittedFolders?.() ?? [])
    ].sort();

    const seen = new Set<string>();

    const rendered = (files: PromptFile[]) =>
      renderPrompt(format, {
        systemMessage,
        files,
        changes
      });

    const empty = rendered([]);

    if (Buffer.byteLength(empty) > config.maxTotalBytes) {
      return this.finish(
        CopyStop.TotalBytes,
        format,
        systemMessage,
        changes,
        included,
        omittedFiles,
        omittedFolders,
        0
      );
    }

    for (let index = 0; index < filePaths.length; index += 1) {
      const filePath = filePaths[index];
      const pending = filePaths.length - index;

      await new Promise(resolve => setImmediate(resolve));

      if (isCancelled()) {
        return this.finish(
          CopyStop.UserCancelled,
          format,
          systemMessage,
          changes,
          included,
          omittedFiles,
          omittedFolders,
          pending
        );
      }

      if (included.length >= config.maxFiles) {
        return this.finish(
          CopyStop.FileBudget,
          format,
          systemMessage,
          changes,
          included,
          omittedFiles,
          omittedFolders,
          pending
        );
      }

      const normalized = filePath;

      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      const isFile = await this.files.existsAndIsFile(normalized);

      if (!isFile) {
        continue;
      }

      const name = toPosixRelative(this.workspaceRoot, normalized);
      const decision = this.resolver.resolvePath(name, 'file');

      if (!decision.included) {
        omittedFiles.push({
          path: name,
          reason: decision.reason ?? 'ignored',
          pattern: decision.pattern
        });

        continue;
      }

      const size = await this.files.sizeOf(normalized);

      if (size !== undefined && size > config.maxFileBytes) {
        omittedFiles.push({ path: name, reason: 'file-size' });

        continue;
      }

      const isBinary = await this.files.isBinary(normalized);

      if (isBinary) {
        omittedFiles.push({ path: name, reason: 'binary' });

        continue;
      }

      const content = await this.files.readText(normalized);
      const nextText = rendered([...included, { name, content }]);

      if (Buffer.byteLength(nextText) > config.maxTotalBytes) {
        return this.finish(
          CopyStop.TotalBytes,
          format,
          systemMessage,
          changes,
          included,
          omittedFiles,
          omittedFolders,
          pending
        );
      }

      included.push({ name, content });
    }

    return this.finish(
      CopyStop.Completed,
      format,
      systemMessage,
      changes,
      included,
      omittedFiles,
      omittedFolders,
      0
    );
  };

  private finish = (
    stop: CopyStop,
    format: string,
    systemMessage: string | undefined,
    changes: PromptChangeEntry[],
    included: PromptFile[],
    omittedFiles: OmittedFile[],
    omittedFolders: string[],
    pending: number
  ): PromptBuild => {
    const xml =
      stop === CopyStop.UserCancelled
        ? ''
        : renderPrompt(format, {
            systemMessage,
            files: included,
            changes
          });

    return {
      stop,
      xml,
      included,
      omittedFiles,
      omittedFolders,
      pending,
      byteLength: Buffer.byteLength(xml)
    };
  };
}
