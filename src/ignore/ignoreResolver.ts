import fs from 'fs';
import path from 'path';

import ignore from 'ignore';

import { binaryExtensions, builtInPatterns } from './builtInPatterns';
import {
  IgnoreReason,
  type ForcedRoot,
  type IgnoreDecision
} from './ignoreReason';

export type IgnoreResolverOptions = {
  workspaceRoot: string;
  excludePatterns?: string[];
  ignoredExtensions?: string[];
  maxFileBytes?: number;
  forcedRoots?: ForcedRoot[];
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
  const matchers = new Map<string, ReturnType<typeof ignore>>();
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
    matchers.clear();

    if (!filePath) {
      cache.clear();

      return;
    }

    cache.delete(filePath);
  };
  const matcherFor = (directories: string[], includeExclude: boolean) => {
    const key = `${includeExclude ? 'all' : 'inner'}\0${directories.join('\0')}`;
    const cached = matchers.get(key);

    if (cached) {
      return cached;
    }

    const matcher = ignore().add(builtInPatterns);

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

    if (includeExclude) {
      matcher.add((options.excludePatterns ?? []).join('\n'));
    }

    matcher.add(extensionPatterns);
    matchers.set(key, matcher);

    return matcher;
  };
  const resolve = (
    relativePath: string,
    kind: 'file' | 'directory'
  ): IgnoreDecision => {
    const probe = probeFor(relativePath, kind);

    if (probe === '') {
      return { included: true };
    }

    const directories = parentDirectories(probe);
    const forced = coveringForcedRoot(probe, options.forcedRoots ?? []);

    if (forced && promptignoreMatch(probe, directories, options, readCached)) {
      return {
        included: false,
        reason: IgnoreReason.Promptignore,
        sourceFile: '.promptignore'
      };
    }

    const activeDirectories = forced
      ? directories.filter(
          directory =>
            directory === forced.relativePath ||
            directory.startsWith(`${forced.relativePath}/`)
        )
      : directories;
    const matcher = matcherFor(activeDirectories, !forced);

    if (matcher.ignores(probe)) {
      return {
        included: false,
        reason: reasonFor(probe, options, activeDirectories, readCached)
      };
    }

    if (kind === 'file' && binary.ignores(probe)) {
      return { included: false, reason: IgnoreReason.Binary };
    }

    if (forced) {
      return {
        included: true,
        manual: true,
        pattern: forced.pattern,
        sourceFile: forced.sourceFile
      };
    }

    return { included: true };
  };

  const explain = (
    relativePath: string,
    kind: 'file' | 'directory'
  ): IgnoreDecision => {
    const probe = probeFor(relativePath, kind);

    if (probe === '') {
      return { included: true };
    }

    const marked = ignore();
    const directories = parentDirectories(probe);

    for (const line of builtInPatterns.split('\n')) {
      if (line.trim()) {
        marked.add({ pattern: line.trim(), mark: 'built-in' });
      }
    }

    for (const directory of directories) {
      addMarkedFile(
        marked,
        options.workspaceRoot,
        directory,
        '.gitignore',
        readCached
      );
      addMarkedFile(
        marked,
        options.workspaceRoot,
        directory,
        '.promptignore',
        readCached
      );
    }

    for (const pattern of options.excludePatterns ?? []) {
      if (pattern.trim()) {
        marked.add({ pattern: pattern.trim(), mark: 'files2prompt.exclude' });
      }
    }

    for (const pattern of extensionPatterns.split('\n')) {
      if (pattern.trim()) {
        marked.add({
          pattern: pattern.trim(),
          mark: 'files2prompt.ignoredExtensions'
        });
      }
    }

    const result = marked.test(probe);

    if (!result.ignored) {
      if (kind === 'file' && binary.ignores(probe)) {
        return {
          included: false,
          reason: IgnoreReason.Binary,
          sourceFile: 'built-in'
        };
      }

      return { included: true };
    }

    const sourceFile = result.rule?.mark ?? 'built-in';

    return {
      included: false,
      reason: reasonFromMark(sourceFile),
      pattern: result.rule?.pattern,
      sourceFile
    };
  };

  return { resolve, invalidate, explain };
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

const coveringForcedRoot = (probe: string, roots: ForcedRoot[]) => {
  const normalized = probe.replace(/\/$/, '');

  return roots
    .filter(root => {
      const base = root.relativePath.replace(/\/$/, '');

      return normalized === base || normalized.startsWith(`${base}/`);
    })
    .sort(
      (left, right) => right.relativePath.length - left.relativePath.length
    )[0];
};

const promptignoreMatch = (
  probe: string,
  directories: string[],
  options: IgnoreResolverOptions,
  readCached: (filePath: string) => string
) => {
  const matcher = ignore();

  for (const directory of directories) {
    addIgnoreFile(
      matcher,
      options.workspaceRoot,
      directory,
      '.promptignore',
      readCached
    );
  }

  return matcher.ignores(probe);
};

const reasonFromMark = (mark: string) => {
  if (mark.includes('.promptignore')) {
    return IgnoreReason.Promptignore;
  }

  if (mark.includes('.gitignore')) {
    return IgnoreReason.Gitignore;
  }

  if (mark === 'files2prompt.exclude') {
    return IgnoreReason.WorkspaceExclude;
  }

  if (mark === 'files2prompt.ignoredExtensions') {
    return IgnoreReason.IgnoredExtension;
  }

  return IgnoreReason.BuiltIn;
};

const addMarkedFile = (
  matcher: ReturnType<typeof ignore>,
  workspaceRoot: string,
  directory: string,
  fileName: string,
  readCached: (filePath: string) => string
) => {
  const sourceFile = directory ? `${directory}/${fileName}` : fileName;
  const content = readCached(path.join(workspaceRoot, directory, fileName));

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const pattern = directory ? prefixLine(trimmed, directory) : trimmed;

    matcher.add({ pattern, mark: sourceFile });
  }
};

const prefixLine = (line: string, directory: string) => {
  const negated = line.startsWith('!');
  const body = negated ? line.slice(1) : line;
  const prefixed = body.startsWith('/')
    ? `${directory}${body}`
    : `${directory}/${body}`;

  return `${negated ? '!' : ''}${prefixed}`;
};

const reasonFor = (
  probe: string,
  options: IgnoreResolverOptions,
  directories: string[],
  readCached: (filePath: string) => string = readIfExists
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
      readCached(path.join(options.workspaceRoot, directory, '.promptignore'))
    ) {
      return IgnoreReason.Promptignore;
    }

    if (readCached(path.join(options.workspaceRoot, directory, '.gitignore'))) {
      return IgnoreReason.Gitignore;
    }
  }

  return IgnoreReason.BuiltIn;
};
