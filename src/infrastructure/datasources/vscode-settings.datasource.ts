import * as vscode from 'vscode';

import {
  type PromptSettings,
  SettingsDataSource
} from '../../domain/datasources/settings.datasource';
import { DiffMode } from '../../domain/entities/diff-mode.enum';
import { OutputFormat } from '../../domain/entities/output-format.enum';

export class VscodeSettingsDataSource extends SettingsDataSource {
  promptSettings = (): PromptSettings => {
    const config = vscode.workspace.getConfiguration('files2prompt');

    return {
      systemMessage: config.get<string>('systemMessage') || undefined,
      outputFormat: config.get<OutputFormat>('outputFormat', OutputFormat.Xml),
      diffMode: config.get<DiffMode>('diffMode', DiffMode.DiffAndFiles),
      maxFileBytes: config.get<number>('maxFileBytes', 1048576),
      maxTotalBytes: config.get<number>('maxTotalBytes', 8388608),
      maxFiles: config.get<number>('maxFiles', 5000)
    };
  };
}
