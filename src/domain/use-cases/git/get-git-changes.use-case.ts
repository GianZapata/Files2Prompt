import type { PromptChange } from '../../entities/git-change.entity';
import type {
  GitChangesRepository,
  RepositoryScopeRequest
} from '../../repositories/git-changes.repository';

export interface GetGitChangesUseCase {
  execute(request: RepositoryScopeRequest): Promise<PromptChange[]>;
}

export class GetGitChanges implements GetGitChangesUseCase {
  constructor(private readonly gitRepository: GitChangesRepository) {}

  execute = async (request: RepositoryScopeRequest): Promise<PromptChange[]> =>
    this.gitRepository.getChangesForScope(request);
}
