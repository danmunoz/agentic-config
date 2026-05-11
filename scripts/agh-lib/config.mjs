import path from 'node:path';
import { CONFIG_TARGETS, GLOBAL_SKILLS_LINK, getRepoAgentsFile } from './constants.mjs';
import { ensureSymlink } from './utils.mjs';

export async function configureAgentInstructions({ repoRoot, homeDir, selectedTools }) {
  const sourceFile = getRepoAgentsFile(repoRoot);
  const results = [];
  const allowedTools = new Set(selectedTools ?? CONFIG_TARGETS.map((target) => target.id));

  for (const target of CONFIG_TARGETS) {
    if (!allowedTools.has(target.id)) {
      continue;
    }

    const linkPath = path.join(homeDir, ...target.relativePath);
    const result = await ensureSymlink(sourceFile, linkPath);
    results.push({
      id: target.id,
      label: target.label,
      ...result,
    });
  }

  return results;
}

export async function configureGlobalSkills({ repoRoot, homeDir }) {
  const sourceDir = path.join(repoRoot, 'skills', 'global');
  const linkPath = path.join(homeDir, ...GLOBAL_SKILLS_LINK);
  return ensureSymlink(sourceDir, linkPath);
}
