import type { DiffMode } from '../entities/diff-mode.enum';
import type { OutputFormat } from '../entities/output-format.enum';

export interface PromptSettings {
  systemMessage?: string;
  systemMessageFromWorkspace?: boolean;
  outputFormat: OutputFormat;
  diffMode: DiffMode;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  includeTree: boolean;
}

export abstract class SettingsDataSource {
  abstract promptSettings(): PromptSettings;
}
