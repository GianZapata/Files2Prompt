import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverRepositories, repositoryLabel } from '../src/gitRepos';

test('discovery keeps repositories and submodules, and skips an excluded worktree', () => {
  const found = discoverRepositories(
    '/ws/elcaba',
    [
      {
        rootPath: '/ws/elcaba/elcaba-api',
        branch: 'feature/admin-dashboard',
        submodules: [{ path: 'vendor/pkg', commit: 'abcdef1234567890' }]
      },
      {
        rootPath: '/ws/elcaba/elcaba-panel-admin',
        branch: 'main'
      },
      {
        rootPath:
          '/ws/elcaba/elcaba-panel-admin/.worktrees/feature-structure-01',
        branch: 'feature-structure-01'
      }
    ],
    relative => !relative.includes('.worktrees')
  );

  assert.deepEqual(
    found.map(repo => repo.relativePath),
    ['elcaba-api', 'elcaba-api/vendor/pkg', 'elcaba-panel-admin']
  );
  assert.equal(repositoryLabel(found[0]).message, 'git · {0}');
  assert.equal(repositoryLabel(found[0]).args[0], 'feature/admin-dashboard');
  assert.equal(repositoryLabel(found[1]).message, 'submodule · {0}');
  assert.equal(repositoryLabel(found[1]).args[0], 'abcdef1');
});
