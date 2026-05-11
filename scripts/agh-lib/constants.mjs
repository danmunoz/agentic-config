import path from 'node:path';

export const SKILL_SCOPES = ['global', 'local'];
export const LOCAL_SKILL_PLATFORMS = ['ios', 'android', 'web'];
export const LEGACY_SKILL_TYPES = ['global', ...LOCAL_SKILL_PLATFORMS];

export const LOCKFILE_NAME = 'skill-lock.json';
export const LEGACY_LOCKFILE_NAME = 'skiller-lock.json';
export const LOCKFILE_VERSION = 3;
export const LOCAL_REPO_LOCKFILE_NAME = 'skills-lock.json';

export const SKILLFILE_NAME = 'skillfile.toml';
export const PATH_BLOCK_START = '# >>> agh install >>>';
export const PATH_BLOCK_END = '# <<< agh install <<<';
export const GLOBAL_SKILLS_LINK = ['.agents', 'skills', 'custom'];
export const LOCAL_SKILLS_DIR = ['.agents', 'skills'];

export const CONFIG_TARGETS = [
  {
    id: 'codex',
    label: 'Codex',
    relativePath: ['.codex', 'AGENTS.md'],
  },
  {
    id: 'claude',
    label: 'Claude',
    relativePath: ['.claude', 'CLAUDE.md'],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    relativePath: ['.config', 'opencode', 'AGENTS.md'],
  },
];

export function getRepoScriptsDir(repoRoot) {
  return path.join(repoRoot, 'scripts');
}

export function getRepoAgentsFile(repoRoot) {
  return path.join(repoRoot, 'AGENTS.MD');
}

export function getRepoSkillfilePath(repoRoot) {
  return path.join(repoRoot, SKILLFILE_NAME);
}

export function getGlobalSkillDir(repoRoot) {
  return path.join(repoRoot, 'skills', 'global');
}

export function getLocalSkillBaseDirs(repoRoot) {
  return {
    ios: path.join(repoRoot, 'skills', 'ios'),
    android: path.join(repoRoot, 'skills', 'android'),
    web: path.join(repoRoot, 'skills', 'web'),
  };
}
