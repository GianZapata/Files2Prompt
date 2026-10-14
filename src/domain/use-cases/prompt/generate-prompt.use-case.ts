import type { PromptBuild } from '../../entities/prompt-payload.entity';
import type {
  PromptRepository,
  PromptRequest
} from '../../repositories/prompt.repository';

export interface GeneratePromptUseCase {
  execute(request: PromptRequest): Promise<PromptBuild>;
}

export class GeneratePrompt implements GeneratePromptUseCase {
  constructor(private readonly repository: PromptRepository) {}

  execute = (request: PromptRequest) => this.repository.build(request);
}
