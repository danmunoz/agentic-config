import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function commandPath(command, { env = process.env } = {}) {
  try {
    const { stdout } = await execFileAsync('sh', ['-lc', `command -v ${command}`], { env });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function formatExecError(error) {
  const details = [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .join('\n')
    .trim();
  return details || 'brew install uv failed.';
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function checkScriptRuntimes({ env = process.env } = {}) {
  const uvPath = await commandPath('uv', { env });

  return [
    {
      name: 'uv',
      found: Boolean(uvPath),
      path: uvPath,
      purpose: 'Runs Python-backed scripts with declared dependencies, including nanobanana.',
      installHint: 'Install uv: https://docs.astral.sh/uv/getting-started/installation/',
    },
  ];
}

export async function checkScriptConfiguration({ repoRoot } = {}) {
  const dotEnvPath = path.join(repoRoot, '.env');
  const dotEnvExists = await fileExists(dotEnvPath);

  return [
    {
      name: '.env',
      found: dotEnvExists,
      path: dotEnvPath,
      purpose: 'Provides local environment values for PATH-exposed scripts.',
      setupHint: 'Copy .env.example to .env and fill in local values.',
    },
  ];
}

export async function installUvWithHomebrew({ env = process.env } = {}) {
  const brewPath = await commandPath('brew', { env });
  if (!brewPath) {
    return {
      installed: false,
      message: 'Homebrew is not available on PATH. Install Homebrew first, then run: brew install uv',
    };
  }

  try {
    await execFileAsync(brewPath, ['install', 'uv'], {
      env,
      maxBuffer: 1024 * 1024 * 10,
    });
    return { installed: true };
  } catch (error) {
    return {
      installed: false,
      message: formatExecError(error),
    };
  }
}
