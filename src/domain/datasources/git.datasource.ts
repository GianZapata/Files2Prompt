import type {
  DiscoveredRepository,
  PromptChange
} from '../entities/git-change.entity';
import type { AnyGitScope } from '../entities/git-scope.enum';

export interface GitScopeOptions {
  base?: string;
  commit?: string;
  forcedBase?: string;
}

export abstract class GitDataSource {
  abstract isAvailable(): Promise<boolean>;

  abstract getRepositories(
    workspaceRoot: string,
    filterRelative?: string
  ): Promise<DiscoveredRepository[]>;

  abstract getChangesForScope(
    workspaceRoot: string,
    repoRelative: string,
    scope: AnyGitScope,
    options?: GitScopeOptions
  ): Promise<PromptChange[]>;
}
