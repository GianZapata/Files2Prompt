import assert from 'node:assert/strict';
import test from 'node:test';

import {
  trackRepositories,
  type GitApiLike,
  type GitApiRepository
} from '../src/domain/services/git-repos.service';

const createRepository = (name: string) => {
  const listeners = new Set<() => void>();
  const repository: GitApiRepository = {
    rootUri: { fsPath: `/ws/${name}` },
    state: {
      onDidChange: listener => {
        listeners.add(listener);

        return { dispose: () => listeners.delete(listener) };
      }
    }
  };

  return {
    repository,
    listeners,
    change: () => [...listeners].forEach(fn => fn())
  };
};

const createApi = (initial: GitApiRepository[]) => {
  const opened = new Set<(repository: GitApiRepository) => void>();
  const closed = new Set<(repository: GitApiRepository) => void>();
  const api: GitApiLike = {
    repositories: [...initial],
    onDidOpenRepository: listener => {
      opened.add(listener);

      return { dispose: () => opened.delete(listener) };
    },
    onDidCloseRepository: listener => {
      closed.add(listener);

      return { dispose: () => closed.delete(listener) };
    }
  };

  return {
    api,
    open: (repository: GitApiRepository) => {
      api.repositories.push(repository);
      opened.forEach(listener => listener(repository));
    },
    close: (repository: GitApiRepository) => {
      api.repositories.splice(api.repositories.indexOf(repository), 1);
      closed.forEach(listener => listener(repository));
    },
    openListeners: () => opened.size + closed.size
  };
};

test('watches the repositories that are already open', () => {
  const first = createRepository('api');
  const { api } = createApi([first.repository]);
  let refreshes = 0;

  trackRepositories(api, () => (refreshes += 1));
  first.change();

  assert.equal(refreshes, 1);
});

test('a repository opened later is watched too', () => {
  const later = createRepository('web');
  const host = createApi([]);
  let refreshes = 0;

  trackRepositories(host.api, () => (refreshes += 1));
  host.open(later.repository);

  assert.equal(refreshes, 1, 'opening refreshes once');

  later.change();

  assert.equal(refreshes, 2, 'its own changes refresh as well');
});

test('closing a repository releases its subscription', () => {
  const closing = createRepository('web');
  const host = createApi([closing.repository]);
  let refreshes = 0;

  trackRepositories(host.api, () => (refreshes += 1));
  host.close(closing.repository);

  assert.equal(closing.listeners.size, 0);
  assert.equal(refreshes, 1, 'closing refreshes once');

  closing.change();

  assert.equal(refreshes, 1);
});

test('disposing releases every subscription, including later ones', () => {
  const first = createRepository('api');
  const later = createRepository('web');
  const host = createApi([first.repository]);
  const tracker = trackRepositories(host.api, () => undefined);

  host.open(later.repository);
  tracker.dispose();

  assert.equal(first.listeners.size, 0);
  assert.equal(later.listeners.size, 0);
  assert.equal(host.openListeners(), 0);
});
