import type { DiffMode } from '../entities/diff-mode.enum';
import type { OutputFormat } from '../entities/output-format.enum';

export interface PromptSettings {
  systemMessage?: string;
  outputFormat: OutputFormat;
  diffMode: DiffMode;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}

export abstract class SettingsDataSource {
  abstract promptSettings(): PromptSettings;
}
