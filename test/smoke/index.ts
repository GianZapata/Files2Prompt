import fs from 'fs';
import path from 'path';

import Mocha from 'mocha';

export const run = () => {
  const mocha = new Mocha({ ui: 'tdd', timeout: 60000 });

  for (const file of fs.readdirSync(__dirname)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.join(__dirname, file));
    }
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run(failures =>
      failures > 0 ? reject(new Error(`${failures} tests failed`)) : resolve()
    );
  });
};
