import type { DiscoveredRepository } from '../../entities/git-change.entity';
import type { GitChangesRepository } from '../../repositories/git-changes.repository';

export interface DiscoverGitRepositoriesUseCase {
  execute(filterRelative?: string): Promise<DiscoveredRepository[]>;
}

export class DiscoverGitRepositories implements DiscoverGitRepositoriesUseCase {
  constructor(private readonly gitRepository: GitChangesRepository) {}

  execute = async (filterRelative?: string): Promise<DiscoveredRepository[]> =>
    this.gitRepository.discoverRepositories(filterRelative);
}
