import type {
  DiscoveredRepository,
  PromptChange
} from '../src/domain/entities/git-change.entity';
import type {
  GitChangesRepository,
  RepositoryScopeRequest
} from '../src/domain/repositories/git-changes.repository';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GitScope } from '../src/domain/entities/git-scope.enum';
import { GetGitChanges } from '../src/domain/use-cases/git/get-git-changes.use-case';

test('get-git-changes: delegates request to repository', async () => {
  const requests: RepositoryScopeRequest[] = [];
  const fakeChanges: PromptChange[] = [
    {
      repo: 'my-repo',
      path: 'my-repo/file.ts',
      status: 'modified'
    }
  ];

  const fakeRepo: GitChangesRepository = {
    isAvailable: async () => true,
    discoverRepositories: async () => [] as DiscoveredRepository[],
    getChangesForScope: async request => {
      requests.push(request);

      return fakeChanges;
    }
  };

  const useCase = new GetGitChanges(fakeRepo);
  const result = await useCase.execute({
    repoRelative: 'my-repo',
    scope: GitScope.Staged
  });

  assert.deepEqual(result, fakeChanges);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].repoRelative, 'my-repo');
  assert.equal(requests[0].scope, GitScope.Staged);
});
