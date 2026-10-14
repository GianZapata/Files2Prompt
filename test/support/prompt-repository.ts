import fs from 'fs';

import { WorkspaceFilesDataSource } from '../../src/domain/datasources/workspace-files.datasource';
import { DiffMode } from '../../src/domain/entities/diff-mode.enum';
import { OutputFormat } from '../../src/domain/entities/output-format.enum';
import { PromptRepositoryImpl } from '../../src/infrastructure/repositories/prompt.repository.impl';

export interface RepositoryLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}

export const defaultLimits: RepositoryLimits = {
  maxFileBytes: 1048576,
  maxTotalBytes: 8388608,
  maxFiles: 5000
};

export class DiskFilesDataSource extends WorkspaceFilesDataSource {
  existsAndIsFile = async (filePath: string) =>
    fs.existsSync(filePath) && fs.lstatSync(filePath).isFile();

  sizeOf = async (filePath: string) => fs.statSync(filePath).size;

  isBinary = async (filePath: string) => {
    const sample = fs.readFileSync(filePath).subarray(0, 8192);

    return sample.includes(0);
  };

  readText = async (filePath: string) => fs.readFileSync(filePath, 'utf8');

  realPathOf = async (filePath: string) => fs.realpathSync(filePath);
}

export const repositoryFor = (
  workspace: string,
  limits: Partial<RepositoryLimits> = {},
  format: OutputFormat = OutputFormat.Xml,
  systemMessage?: string
) =>
  new PromptRepositoryImpl(
    workspace,
    new DiskFilesDataSource(),
    {
      promptSettings: () => ({
        outputFormat: format,
        systemMessage,
        diffMode: DiffMode.DiffAndFiles,
        ...defaultLimits,
        ...limits
      })
    },
    { resolvePath: () => ({ included: true }) }
  );
