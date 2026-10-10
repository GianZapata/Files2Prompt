import fs from 'fs';
import path from 'path';

import ignore from 'ignore';

import { binaryExtensions, builtInPatterns } from './builtInPatterns';
import { IgnoreReason, type IgnoreDecision } from './ignoreReason';

export type IgnoreResolverOptions = {
  workspaceRoot: string;
  excludePatterns?: string[];
  ignoredExtensions?: string[];
  maxFileBytes?: number;
};

const toPosix = (value: string) => value.split(path.sep).join('/');

const readIfExists = (filePath: string) =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

const probeFor = (relativePath: string, kind: 'file' | 'directory') => {
  const normalized = toPosix(relativePath)
    .replace(/^\.\//, '')
    .replace(/\/$/, '');

  if (normalized === '' || normalized === '.') {
    return '';
  }

  return kind === 'directory' ? `${normalized}/` : normalized;
};

export const createIgnoreResolver = (options: IgnoreResolverOptions) => {
  const extensionPatterns = (options.ignoredExtensions ?? [])
    .filter(Boolean)
    .map(extension => `*.${extension.replace(/^\./, '')}`)
    .join('\n');
  const binary = ignore().add(
    binaryExtensions.map(extension => `*.${extension}`).join('\n')
  );

  const cache = new Map<string, string>();
  const readCached = (filePath: string) => {
    const hit = cache.get(filePath);

    if (hit !== undefined) {
      return hit;
    }

    const content = readIfExists(filePath);

    cache.set(filePath, content);

    return content;
  };
  const invalidate = (filePath?: string) => {
    if (!filePath) {
      cache.clear();

      return;
    }

    cache.delete(filePath);
  };
  const resolve = (
    relativePath: string,
    kind: 'file' | 'directory'
  ): IgnoreDecision => {
    const probe = probeFor(relativePath, kind);

    if (probe === '') {
      return { included: true };
    }

    const matcher = ignore().add(builtInPatterns);
    const directories = parentDirectories(probe);

    for (const directory of directories) {
      addIgnoreFile(
        matcher,
        options.workspaceRoot,
        directory,
        '.gitignore',
        readCached
      );
    }

    for (const directory of directories) {
      addIgnoreFile(
        matcher,
        options.workspaceRoot,
        directory,
        '.promptignore',
        readCached
      );
    }

    matcher.add((options.excludePatterns ?? []).join('\n'));
    matcher.add(extensionPatterns);

    if (matcher.ignores(probe)) {
      return {
        included: false,
        reason: reasonFor(probe, options, directories)
      };
    }

    if (kind === 'file' && binary.ignores(probe)) {
      return { included: false, reason: IgnoreReason.Binary };
    }

    return { included: true };
  };

  return { resolve, invalidate };
};

const parentDirectories = (probe: string) => {
  const parts = probe.replace(/\/$/, '').split('/');
  const directories = [''];

  for (let index = 0; index < parts.length - 1; index += 1) {
    directories.push(parts.slice(0, index + 1).join('/'));
  }

  return directories;
};

const addIgnoreFile = (
  matcher: ReturnType<typeof ignore>,
  workspaceRoot: string,
  directory: string,
  fileName: string,
  readCached: (filePath: string) => string
) => {
  const content = readCached(path.join(workspaceRoot, directory, fileName));

  if (!content) {
    return;
  }

  matcher.add(directory ? prefixPatterns(content, directory) : content);
};

const prefixPatterns = (content: string, directory: string) =>
  content
    .split('\n')
    .map(line => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }

      const negated = trimmed.startsWith('!');
      const body = negated ? trimmed.slice(1) : trimmed;
      const prefixed = body.startsWith('/')
        ? `${directory}${body}`
        : `${directory}/${body}`;

      return `${negated ? '!' : ''}${prefixed}`;
    })
    .join('\n');

const reasonFor = (
  probe: string,
  options: IgnoreResolverOptions,
  directories: string[]
): IgnoreReason => {
  if (
    ignore()
      .add((options.excludePatterns ?? []).join('\n'))
      .ignores(probe)
  ) {
    return IgnoreReason.WorkspaceExclude;
  }

  for (const directory of [...directories].reverse()) {
    if (
      readIfExists(path.join(options.workspaceRoot, directory, '.promptignore'))
    ) {
      return IgnoreReason.Promptignore;
    }

    if (
      readIfExists(path.join(options.workspaceRoot, directory, '.gitignore'))
    ) {
      return IgnoreReason.Gitignore;
    }
  }

  return IgnoreReason.BuiltIn;
};
