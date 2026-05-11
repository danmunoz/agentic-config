import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensurePathBlock, renderPathBlock } from '../path-config.mjs';
import { makeTempDir, writeFile } from './helpers.mjs';

test('ensurePathBlock appends a managed block once', async () => {
  const root = await makeTempDir();
  const rcFile = path.join(root, '.zshrc');
  const scriptsDir = '/tmp/agentic-config/scripts';

  await ensurePathBlock(rcFile, scriptsDir);
  await ensurePathBlock(rcFile, scriptsDir);

  const content = await fs.readFile(rcFile, 'utf8');
  assert.equal(content, `${renderPathBlock(scriptsDir)}\n`);
});

test('ensurePathBlock updates an existing managed block in place', async () => {
  const root = await makeTempDir();
  const rcFile = path.join(root, '.zprofile');

  await writeFile(
    rcFile,
    [
      '# existing',
      '',
      '# >>> agh install >>>',
      'if [ -d "/old/path" ] && [[ ":$PATH:" != *":/old/path:"* ]]; then',
      '  export PATH="/old/path:$PATH"',
      'fi',
      '# <<< agh install <<<',
      '',
    ].join('\n')
  );

  await ensurePathBlock(rcFile, '/new/path');
  const content = await fs.readFile(rcFile, 'utf8');

  assert.match(content, /\/new\/path/);
  assert.doesNotMatch(content, /\/old\/path/);
});
