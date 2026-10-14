import type {
  DiscoveredRepository,
  PromptChange
} from '../entities/git-change.entity';
import type { AnyGitScope } from '../entities/git-scope.enum';

export interface RepositoryScopeRequest {
  repoRelative: string;
  scope: AnyGitScope;
  forcedBase?: string;
}

export abstract class GitChangesRepository {
  abstract isAvailable(): Promise<boolean>;

  abstract discoverRepositories(
    filterRelative?: string
  ): Promise<DiscoveredRepository[]>;

  abstract getChangesForScope(
    request: RepositoryScopeRequest
  ): Promise<PromptChange[]>;
}
