import type { AnyCopyStop } from './copy-stop.enum';

export interface PromptFile {
  name: string;
  content: string;
}

export interface PromptChangeEntry {
  repo: string;
  path: string;
  status: string;
  scope?: string;
  base?: string;
  head?: string;
  from?: string;
  to?: string;
  binary?: boolean;
  generated?: boolean;
  diff?: string;
}

export interface PromptPayload {
  systemMessage?: string;
  files: PromptFile[];
  changes?: PromptChangeEntry[];
}

export interface OmittedFile {
  path: string;
  reason: string;
  pattern?: string;
}

export interface PromptBuild {
  stop: AnyCopyStop;
  output: string;
  included: PromptFile[];
  omittedFiles: OmittedFile[];
  omittedFolders: string[];
  pending: number;
  byteLength: number;
  systemMessageFromWorkspace?: boolean;
}
