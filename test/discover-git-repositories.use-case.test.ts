import type {
  DiscoveredRepository,
  PromptChange
} from '../src/domain/entities/git-change.entity';
import type { GitChangesRepository } from '../src/domain/repositories/git-changes.repository';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DiscoverGitRepositories } from '../src/domain/use-cases/git/discover-git-repositories.use-case';

test('discover-git-repositories: delegates filter to repository', async () => {
  const filters: Array<string | undefined> = [];
  const fakeRepos: DiscoveredRepository[] = [
    {
      relativePath: 'packages/core',
      kind: 'repository',
      branch: 'main'
    }
  ];

  const fakeRepo: GitChangesRepository = {
    isAvailable: async () => true,
    discoverRepositories: async filter => {
      filters.push(filter);

      return fakeRepos;
    },
    getChangesForScope: async () => [] as PromptChange[]
  };

  const useCase = new DiscoverGitRepositories(fakeRepo);
  const result = await useCase.execute('packages/core');

  assert.deepEqual(result, fakeRepos);
  assert.deepEqual(filters, ['packages/core']);
});
