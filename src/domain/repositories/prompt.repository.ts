import type { OutputFormat } from '../entities/output-format.enum';
import type {
  PromptBuild,
  PromptChangeEntry
} from '../entities/prompt-payload.entity';

export interface PromptRequest {
  filePaths: string[];
  changes?: PromptChangeEntry[];
  includeSystemMessage?: boolean;
  format?: OutputFormat;
  isCancelled?: () => boolean;
}

export abstract class PromptRepository {
  abstract build(request: PromptRequest): Promise<PromptBuild>;
}
