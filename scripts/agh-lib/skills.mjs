import path from 'node:path';
import {
  getGlobalSkillDir,
  getLocalSkillBaseDirs,
  getRepoSkillfilePath,
  LOCAL_SKILLS_DIR,
} from './constants.mjs';
import { configureGlobalSkills } from './config.mjs';
import {
  findLocalRepoInstall,
  readLocalRepoLockfile,
  upsertLocalRepoInstall,
  writeLocalRepoLockfile,
} from './local-repo-lockfile.mjs';
import { findInstall, readLockfile } from './lockfile.mjs';
import { syncManagedSkills } from './managed-skills.mjs';
import { readSkillfile } from './skillfile.mjs';
import { listSkillDirectories, pathExists, replaceDirectory } from './utils.mjs';

function sameLocalRepoInstall(existing, nextEntry) {
  return (
    existing?.version === nextEntry.version &&
    existing?.url === nextEntry.url &&
    existing?.resolvedCommit === nextEntry.resolvedCommit
  );
}

function toLocalRepoInstall(skill) {
  if (
    typeof skill.url !== 'string' ||
    typeof skill.resolvedCommit !== 'string'
  ) {
    throw new Error(`Managed skill metadata is missing for "${skill.name}". Run agh set-skills first.`);
  }

  return {
    name: skill.name,
    version: skill.version ?? null,
    url: skill.url,
    resolvedCommit: skill.resolvedCommit,
  };
}

export async function collectSkillSources(repoRoot, selectedPlatforms) {
  const sources = new Map();
  const baseDirs = getLocalSkillBaseDirs(repoRoot);
  const lockfile = await readLockfile(repoRoot);

  for (const platform of selectedPlatforms) {
    const platformDir = baseDirs[platform];
    const skillDirs = await listSkillDirectories(platformDir);

    for (const skill of skillDirs) {
      const existing = sources.get(skill.name);
      if (existing) {
        throw new Error(
          `Skill "${skill.name}" exists in both "${existing.platform}" and "${platform}". Select a non-conflicting set of local platforms.`
        );
      }

      const managedInstall = findInstall(lockfile, 'local', platform, skill.name);
      sources.set(skill.name, {
        name: skill.name,
        path: skill.path,
        platform,
        version: managedInstall?.requestedVersion ?? null,
        url: managedInstall?.originalUrl ?? null,
        resolvedCommit: managedInstall?.resolvedCommit ?? null,
      });
    }
  }

  return [...sources.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listGlobalSkillNames(repoRoot) {
  const skillDirs = await listSkillDirectories(getGlobalSkillDir(repoRoot));
  return skillDirs.map((skill) => skill.name);
}

export async function copySkillsToProject(skillSources, targetRepoRoot) {
  const targetBase = path.join(targetRepoRoot, ...LOCAL_SKILLS_DIR);
  let localRepoLockfile = await readLocalRepoLockfile(targetRepoRoot);
  const copied = [];
  const skipped = [];
  let changed = false;

  for (const skill of skillSources) {
    const targetDir = path.join(targetBase, skill.name);
    const expectedInstall = toLocalRepoInstall(skill);
    const existingInstall = findLocalRepoInstall(localRepoLockfile, skill.name);
    const installExists = await pathExists(targetDir);

    if (installExists && sameLocalRepoInstall(existingInstall, expectedInstall)) {
      skipped.push({
        name: skill.name,
        sourcePlatform: skill.platform,
        targetDir,
      });
      continue;
    }

    await replaceDirectory(skill.path, targetDir);
    localRepoLockfile = upsertLocalRepoInstall(localRepoLockfile, expectedInstall);
    changed = true;
    copied.push({
      name: skill.name,
      sourcePlatform: skill.platform,
      targetDir,
    });
  }

  if (changed) {
    await writeLocalRepoLockfile(targetRepoRoot, localRepoLockfile);
  }

  return {
    copied,
    skipped,
  };
}

export async function applySkillSetup(
  {
    repoRoot,
    projectRoot,
    homeDir,
    scope,
    selectedPlatforms = [],
  },
  options = {}
) {
  const entries = await readSkillfile(getRepoSkillfilePath(repoRoot));
  const syncer = options.syncSkills ?? syncManagedSkills;
  const syncResult = await syncer(entries, { repoRoot });

  let globalResult = null;
  let copiedSkills = [];
  let skippedSkills = [];

  if (scope === 'global' || scope === 'both') {
    globalResult = await configureGlobalSkills({ repoRoot, homeDir });
  }

  if (scope === 'local' || scope === 'both') {
    const skillSources = await collectSkillSources(repoRoot, selectedPlatforms);
    const copyResult = await copySkillsToProject(skillSources, projectRoot);
    copiedSkills = copyResult.copied;
    skippedSkills = copyResult.skipped;
  }

  return {
    entries,
    syncResult,
    globalResult,
    copiedSkills,
    skippedSkills,
  };
}
