import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverRepositories, repositoryLabel } from '../src/gitRepos';

test('discovery keeps repositories and submodules, and skips an excluded worktree', () => {
  const found = discoverRepositories(
    '/ws/launcher',
    [
      {
        rootPath: '/ws/launcher/launcher/api',
        branch: 'feature/example',
        submodules: [{ path: 'vendor/pkg', commit: 'abcdef1234567890' }]
      },
      {
        rootPath: '/ws/launcher/launcher/web',
        branch: 'main'
      },
      {
        rootPath:
          '/ws/launcher/launcher/web/.worktrees/feature-structure-01',
        branch: 'feature-structure-01'
      }
    ],
    relative => !relative.includes('.worktrees')
  );

  assert.deepEqual(
    found.map(repo => repo.relativePath),
    ['launcher/api', 'launcher/api/vendor/pkg', 'launcher/web']
  );
  assert.equal(repositoryLabel(found[0]).message, 'git · {0}');
  assert.equal(repositoryLabel(found[0]).args[0], 'feature/example');
  assert.equal(repositoryLabel(found[1]).message, 'submodule · {0}');
  assert.equal(repositoryLabel(found[1]).args[0], 'abcdef1');
});
