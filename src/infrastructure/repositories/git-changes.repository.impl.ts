import type { GitDataSource } from '../../domain/datasources/git.datasource';
import type {
  DiscoveredRepository,
  PromptChange
} from '../../domain/entities/git-change.entity';

import {
  GitChangesRepository,
  type RepositoryScopeRequest
} from '../../domain/repositories/git-changes.repository';

export class GitChangesRepositoryImpl extends GitChangesRepository {
  constructor(
    private readonly workspaceRoot: string,
    private readonly dataSource: GitDataSource
  ) {
    super();
  }

  isAvailable = async (): Promise<boolean> => this.dataSource.isAvailable();

  discoverRepositories = async (
    filterRelative?: string
  ): Promise<DiscoveredRepository[]> =>
    this.dataSource.getRepositories(this.workspaceRoot, filterRelative);

  getChangesForScope = async (
    request: RepositoryScopeRequest
  ): Promise<PromptChange[]> =>
    this.dataSource.getChangesForScope(
      this.workspaceRoot,
      request.repoRelative,
      request.scope,
      { forcedBase: request.forcedBase }
    );
}
