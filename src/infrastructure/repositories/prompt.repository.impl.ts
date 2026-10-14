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
import { IgnoreReason } from '../../domain/entities/ignore-reason.enum';
import { isSameOrInside } from '../../domain/helpers/path-containment';
import { toPosixRelative } from '../../domain/helpers/to-posix-relative';
import {
  PromptRepository,
  type PromptRequest
} from '../../domain/repositories/prompt.repository';
import { promptLayout } from '../../domain/services/prompt-formats.service';

export interface PromptPathResolver {
  resolvePath: (
    relativePath: string,
    kind: PathKind | 'file' | 'directory'
  ) => IgnoreDecision;
  omittedFolders?: () => string[];
  isSkippedGenerated?: (relativePath: string) => boolean;
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
    const requestedChanges =
      diffMode === DiffMode.FilesOnly
        ? []
        : (request.changes ?? this.resolver.promptChangeList?.() ?? []);

    const kept = requestedChanges.filter(
      change =>
        this.resolver.resolvePath(change.path, 'file').reason !==
        IgnoreReason.Sensitive
    );

    const changes = kept.map(change =>
      this.resolver.isSkippedGenerated?.(change.path)
        ? { ...change, generated: true, diff: undefined }
        : change
    );

    const systemMessage =
      (request.includeSystemMessage ?? true) ? config.systemMessage : undefined;

    const included: PromptFile[] = [];
    const omittedFiles: OmittedFile[] = requestedChanges
      .filter(change => !kept.includes(change))
      .map(change => ({
        path: change.path,
        reason: IgnoreReason.Sensitive,
        pattern: this.resolver.resolvePath(change.path, 'file').pattern
      }));

    for (const skipped of request.skippedGenerated ?? []) {
      omittedFiles.push({ path: skipped, reason: IgnoreReason.Generated });
    }

    const omittedFolders: string[] = [
      ...new Set(this.resolver.omittedFolders?.() ?? [])
    ].sort();

    const seen = new Set<string>();
    const realRoot = await this.files.realPathOf(this.workspaceRoot);

    const layout = promptLayout(format, { systemMessage, changes });
    const pieces: string[] = [];
    let usedBytes = layout.emptyBytes;

    const finish = (stop: CopyStop, pending: number): PromptBuild => {
      const cancelled = stop === CopyStop.UserCancelled;

      return {
        stop,
        output: cancelled ? '' : layout.assemble(pieces),
        included,
        omittedFiles,
        omittedFolders,
        pending,
        byteLength: cancelled ? 0 : usedBytes,
        ...(systemMessage && config.systemMessageFromWorkspace
          ? { systemMessageFromWorkspace: true }
          : {})
      };
    };

    if (layout.emptyBytes > config.maxTotalBytes) {
      return finish(CopyStop.TotalBytes, 0);
    }

    for (let index = 0; index < filePaths.length; index += 1) {
      const filePath = filePaths[index];
      const pending = filePaths.length - index;

      await new Promise(resolve => setImmediate(resolve));

      if (isCancelled()) {
        return finish(CopyStop.UserCancelled, pending);
      }

      if (included.length >= config.maxFiles) {
        return finish(CopyStop.FileBudget, pending);
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
      const realFile = await this.files.realPathOf(normalized);

      if (
        realRoot === undefined ||
        realFile === undefined ||
        !isSameOrInside(realRoot, realFile)
      ) {
        omittedFiles.push({ path: name, reason: IgnoreReason.Symlink });

        continue;
      }

      const decision = this.resolver.resolvePath(name, 'file');

      if (!decision.included) {
        if (!omittedFiles.some(omitted => omitted.path === name)) {
          omittedFiles.push({
            path: name,
            reason: decision.reason ?? 'ignored',
            pattern: decision.pattern
          });
        }

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
      const piece = layout.piece({ name, content });
      const nextBytes =
        usedBytes + layout.bytesToAdd(Buffer.byteLength(piece), pieces.length);

      if (nextBytes > config.maxTotalBytes) {
        return finish(CopyStop.TotalBytes, pending);
      }

      pieces.push(piece);
      included.push({ name, content });
      usedBytes = nextBytes;
    }

    return finish(CopyStop.Completed, 0);
  };
}
