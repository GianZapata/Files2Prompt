import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { makeFixture } from './make-fixture.mjs';

const require = createRequire(import.meta.url);
const out = path.resolve(import.meta.dirname, '..', 'out');

const { PromptRepositoryImpl } = require(
  path.join(out, 'infrastructure/repositories/prompt.repository.impl.js')
);

const workspace = makeFixture();
const web = path.join(workspace, 'web');

const files = {
  existsAndIsFile: async file =>
    fs.existsSync(file) && fs.statSync(file).isFile(),
  sizeOf: async file => fs.statSync(file).size,
  isBinary: async file => fs.readFileSync(file).subarray(0, 8192).includes(0),
  readText: async file => fs.readFileSync(file, 'utf8'),
  realPathOf: async file => fs.realpathSync(file)
};

const settings = (outputFormat, systemMessage) => ({
  promptSettings: () => ({
    outputFormat,
    systemMessage,
    diffMode: 'diffAndFiles',
    maxFileBytes: 1048576,
    maxTotalBytes: 8388608,
    maxFiles: 5000,
    includeTree: true,
    compactWhitespace: false
  })
});

const diffOf = file =>
  execFileSync('git', ['diff', 'HEAD', '--', file], {
    cwd: web,
    encoding: 'utf8'
  }).trimEnd();

const changes = [
  {
    repo: 'web',
    scope: 'uncommitted',
    path: 'web/docs/mi archivo.md',
    status: 'MODIFIED',
    diff: diffOf('docs/mi archivo.md')
  }
];

const generate = async (format, systemMessage) => {
  const repository = new PromptRepositoryImpl(
    workspace,
    files,
    settings(format, systemMessage),
    { resolvePath: () => ({ included: true }) }
  );

  const result = await repository.build({
    filePaths: ['docs/mi archivo.md', 'src/app.ts'].map(name =>
      path.join(web, name)
    ),
    changes
  });

  return result.output;
};

const format = process.argv[2] ?? 'xml';

process.stdout.write(
  `${await generate(format, 'Review these changes and suggest fixes.')}\n`
);
