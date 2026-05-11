import fs from 'node:fs/promises';
import path from 'node:path';

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function ensureSymlink(targetPath, linkPath) {
  await ensureDirectory(path.dirname(linkPath));

  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const currentTarget = await fs.readlink(linkPath);
      const resolvedCurrent = path.resolve(path.dirname(linkPath), currentTarget);
      const resolvedExpected = path.resolve(targetPath);
      if (resolvedCurrent === resolvedExpected) {
        return { action: 'unchanged', linkPath, targetPath };
      }
    }
    await fs.rm(linkPath, { recursive: true, force: true });
  } catch {
    // Missing path; continue.
  }

  const relativeTarget = path.relative(path.dirname(linkPath), targetPath) || '.';
  await fs.symlink(relativeTarget, linkPath);
  return { action: 'updated', linkPath, targetPath };
}

export async function replaceDirectory(sourceDir, targetDir) {
  const parentDir = path.dirname(targetDir);
  const tempDir = path.join(parentDir, `.agh-tmp-${path.basename(targetDir)}-${Date.now()}`);

  await ensureDirectory(parentDir);
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.cp(sourceDir, tempDir, { recursive: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.rename(tempDir, targetDir);
}

export async function listSkillDirectories(baseDir) {
  if (!(await pathExists(baseDir))) {
    return [];
  }

  const skillDirs = [];
  const stack = [{ absolutePath: baseDir, relativePath: '' }];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current.absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const absolutePath = path.join(current.absolutePath, entry.name);
      const relativePath = current.relativePath
        ? path.posix.join(current.relativePath, entry.name)
        : entry.name;

      if (await pathExists(path.join(absolutePath, 'SKILL.md'))) {
        skillDirs.push({
          name: relativePath,
          path: absolutePath,
        });
        continue;
      }

      stack.push({
        absolutePath,
        relativePath,
      });
    }
  }

  return skillDirs.sort((left, right) => left.name.localeCompare(right.name));
}

export function formatList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}
