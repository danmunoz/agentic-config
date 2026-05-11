import fs from 'node:fs/promises';
import path from 'node:path';
import { PATH_BLOCK_END, PATH_BLOCK_START } from './constants.mjs';
import { ensureDirectory, pathExists } from './utils.mjs';

export function renderPathBlock(scriptsDir) {
  return [
    PATH_BLOCK_START,
    `if [ -d "${scriptsDir}" ] && [[ ":$PATH:" != *":${scriptsDir}:"* ]]; then`,
    `  export PATH="${scriptsDir}:$PATH"`,
    'fi',
    PATH_BLOCK_END,
  ].join('\n');
}

export function upsertManagedBlock(content, block) {
  const startIndex = content.indexOf(PATH_BLOCK_START);
  const endIndex = content.indexOf(PATH_BLOCK_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = content.slice(0, startIndex).replace(/\s*$/, '');
    const after = content.slice(endIndex + PATH_BLOCK_END.length).replace(/^\s*/, '');
    return [before, block, after].filter(Boolean).join('\n\n').replace(/\s*$/, '') + '\n';
  }

  const trimmed = content.replace(/\s*$/, '');
  return [trimmed, block].filter(Boolean).join('\n\n').replace(/\s*$/, '') + '\n';
}

export async function ensurePathBlock(rcFilePath, scriptsDir) {
  await ensureDirectory(path.dirname(rcFilePath));
  const content = (await pathExists(rcFilePath)) ? await fs.readFile(rcFilePath, 'utf8') : '';
  const nextContent = upsertManagedBlock(content, renderPathBlock(scriptsDir));

  if (content === nextContent) {
    return { path: rcFilePath, action: 'unchanged' };
  }

  await fs.writeFile(rcFilePath, nextContent, 'utf8');
  return { path: rcFilePath, action: 'updated' };
}
