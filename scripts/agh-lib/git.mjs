import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runGit(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

export async function resolveHeadCommit(url) {
  const { stdout } = await runGit(['ls-remote', url, 'HEAD']);
  const line = stdout.trim().split('\n').find(Boolean);
  if (!line) {
    throw new Error(`Could not resolve HEAD for ${url}.`);
  }
  return line.split('\t')[0];
}

export async function cloneRepo(url, version) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agh-skill-'));
  const args = ['clone', '--depth', '1'];
  if (version) {
    args.push('--branch', version, '--single-branch');
  }
  args.push(url, tempDir);

  try {
    await runGit(args);
    return tempDir;
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (version) {
      throw new Error(`Failed to clone ${url} at ref "${version}": ${error.message}`);
    }
    throw new Error(`Failed to clone ${url}: ${error.message}`);
  }
}

export async function getRepoCommit(repoDir) {
  const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoDir });
  return stdout.trim();
}

export async function removeTempDir(tempDir) {
  await fs.rm(tempDir, { recursive: true, force: true });
}
