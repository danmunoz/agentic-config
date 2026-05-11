import fs from 'node:fs/promises';
import path from 'node:path';
import { getGlobalSkillDir, getLocalSkillBaseDirs, LOCAL_SKILL_PLATFORMS } from './constants.mjs';
import { cloneRepo, getRepoCommit, removeTempDir, resolveHeadCommit } from './git.mjs';
import {
  readLocalRepoLockfile,
  removeLocalRepoInstall,
  writeLocalRepoLockfile,
} from './local-repo-lockfile.mjs';
import {
  findInstall,
  listManagedInstalls,
  readLockfile,
  removeInstall,
  upsertInstall,
  writeLockfile,
} from './lockfile.mjs';
import { readSkillMetadata, validateSkillName } from './source-skill.mjs';
import { pathExists, replaceDirectory } from './utils.mjs';

function normalizeUrl(url) {
  if (url.startsWith('.') || url.startsWith('/') || url.startsWith('file:')) {
    return path.resolve(url.replace(/^file:\/\//, ''));
  }
  return url.replace(/\/+$/, '').replace(/\.git$/, '');
}

function makeSkillKey(scope, platform, name) {
  return scope === 'global' ? `global:${name}` : `local:${platform}:${name}`;
}

function getInstallPath(repoRoot, scope, platform, skillName) {
  if (scope === 'global') {
    return path.join(getGlobalSkillDir(repoRoot), skillName);
  }
  return path.join(getLocalSkillBaseDirs(repoRoot)[platform], skillName);
}

function normalizeEntry(entry) {
  return {
    ...entry,
    sourcePath: entry.sourcePath || entry.name,
    platform: entry.scope === 'global' ? null : entry.platform,
  };
}

function validateEntries(entries) {
  const nameToScopes = new Map();
  const seenKeys = new Set();

  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);
    validateSkillName(entry.name);
    validateSkillName(entry.sourcePath);

    const key = makeSkillKey(entry.scope, entry.platform, entry.name);
    if (seenKeys.has(key)) {
      const label = entry.scope === 'global' ? 'global' : `local/${entry.platform}`;
      throw new Error(
        `skillfile line ${entry.lineNumber}: duplicate entry for "${entry.name}" in ${label}.`
      );
    }
    seenKeys.add(key);

    const scopes = nameToScopes.get(entry.name) ?? new Set();
    scopes.add(entry.scope);
    nameToScopes.set(entry.name, scopes);
  }

  for (const [name, scopes] of nameToScopes.entries()) {
    if (scopes.has('global') && scopes.has('local')) {
      throw new Error(
        `skillfile is invalid: "${name}" cannot be listed as both global and local.`
      );
    }
  }
}

async function resolveDesiredRef(entry) {
  const desiredVersion = entry.version || null;
  const desiredMode = desiredVersion ? 'version' : 'head';
  const resolvedHeadCommit = desiredVersion ? null : await resolveHeadCommit(entry.url);
  return {
    desiredVersion,
    desiredMode,
    resolvedHeadCommit,
  };
}

async function performSkillPreflight(entry) {
  const desiredVersion = entry.version || null;
  let tempDir;
  try {
    tempDir = await cloneRepo(entry.url, desiredVersion);
    const metadata = await readSkillMetadata(tempDir, entry.name, entry.sourcePath);
    return {
      metadata,
      resolvedCommit: desiredVersion ? await getRepoCommit(tempDir) : null,
    };
  } finally {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  }
}

async function syncEntry(repoRoot, entry, lockfile) {
  const { desiredVersion, desiredMode, resolvedHeadCommit } = await resolveDesiredRef(entry);
  const normalizedUrl = normalizeUrl(entry.url);
  const installPath = getInstallPath(repoRoot, entry.scope, entry.platform, entry.name);
  const existing = findInstall(lockfile, entry.scope, entry.platform, entry.name);
  const installExists = await pathExists(installPath);

  const matchesLockfile =
    existing &&
    existing.normalizedUrl === normalizedUrl &&
    existing.requestedVersion === desiredVersion &&
    existing.sourcePath === entry.sourcePath &&
    existing.mode === desiredMode &&
    (desiredVersion || existing.resolvedCommit === resolvedHeadCommit);

  if (matchesLockfile && installExists) {
    return {
      key: makeSkillKey(entry.scope, entry.platform, entry.name),
      action: 'skipped',
      entry,
    };
  }

  let tempDir;
  try {
    tempDir = await cloneRepo(entry.url, desiredVersion);
    const resolvedCommit = desiredVersion ? await getRepoCommit(tempDir) : resolvedHeadCommit;
    const metadata = await readSkillMetadata(tempDir, entry.name, entry.sourcePath);
    await replaceDirectory(metadata.skillDir, installPath);

    upsertInstall(lockfile, entry.scope, entry.platform, entry.name, {
      skillName: entry.name,
      scope: entry.scope,
      ...(entry.platform ? { platform: entry.platform } : {}),
      sourcePath: entry.sourcePath,
      originalUrl: entry.url,
      normalizedUrl,
      requestedVersion: desiredVersion,
      mode: desiredMode,
      resolvedCommit,
      description: metadata.description,
      updatedAt: new Date().toISOString(),
    });

    return {
      key: makeSkillKey(entry.scope, entry.platform, entry.name),
      action: existing ? 'updated' : 'installed',
      entry,
    };
  } finally {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  }
}

async function pruneRemovedEntries(repoRoot, desiredKeys, lockfile) {
  const results = [];
  const failures = [];

  for (const managed of listManagedInstalls(lockfile)) {
    const key = makeSkillKey(managed.scope, managed.platform, managed.skillName);
    if (desiredKeys.has(key)) {
      continue;
    }

    try {
      const installPath = getInstallPath(repoRoot, managed.scope, managed.platform, managed.skillName);
      await fs.rm(installPath, { recursive: true, force: true });
      removeInstall(lockfile, managed.scope, managed.platform, managed.skillName);
      results.push({
        key,
        action: 'removed',
        entry: {
          name: managed.skillName,
          scope: managed.scope,
          platform: managed.platform,
        },
      });
    } catch (error) {
      failures.push({
        stage: 'remove',
        entry: {
          name: managed.skillName,
          scope: managed.scope,
          platform: managed.platform,
        },
        error,
      });
    }
  }

  return { results, failures };
}

function formatEntryLocation(entry) {
  return entry.scope === 'global' ? 'global' : entry.platform;
}

function formatFailure(result) {
  const detail = result.error?.message ?? 'unknown error';
  return `${result.entry.name} (${formatEntryLocation(result.entry)}) ${result.stage} failed: ${detail}`;
}

export async function validateManagedSkillEntry(entry) {
  const normalizedEntry = normalizeEntry(entry);
  validateEntries([normalizedEntry]);
  const { desiredVersion, resolvedHeadCommit } = await resolveDesiredRef(normalizedEntry);
  const { metadata, resolvedCommit } = await performSkillPreflight(normalizedEntry);

  return {
    entry: normalizedEntry,
    requestedVersion: desiredVersion,
    resolvedCommit: desiredVersion ? resolvedCommit : resolvedHeadCommit,
    description: metadata.description,
  };
}

export async function installManagedSkillEntry(entry, { repoRoot } = {}) {
  const normalizedEntry = normalizeEntry(entry);
  validateEntries([normalizedEntry]);
  const lockfile = await readLockfile(repoRoot);
  const result = await syncEntry(repoRoot, normalizedEntry, lockfile);
  if (result.action !== 'skipped') {
    await writeLockfile(repoRoot, lockfile);
  }
  return result;
}

export async function removeManagedSkillEntry(entry, { repoRoot, projectRoot } = {}) {
  const normalizedEntry = normalizeEntry(entry);
  const installPath = getInstallPath(
    repoRoot,
    normalizedEntry.scope,
    normalizedEntry.platform,
    normalizedEntry.name
  );
  await fs.rm(installPath, { recursive: true, force: true });

  if (normalizedEntry.scope === 'local' && projectRoot) {
    const currentRepoCopyPath = path.join(projectRoot, '.agents', 'skills', normalizedEntry.name);
    await fs.rm(currentRepoCopyPath, { recursive: true, force: true });
    const localRepoLockfile = await readLocalRepoLockfile(projectRoot);
    const nextLocalRepoLockfile = removeLocalRepoInstall(localRepoLockfile, normalizedEntry.name);
    await writeLocalRepoLockfile(projectRoot, nextLocalRepoLockfile);
  }

  const lockfile = await readLockfile(repoRoot);
  removeInstall(
    lockfile,
    normalizedEntry.scope,
    normalizedEntry.platform,
    normalizedEntry.name
  );
  await writeLockfile(repoRoot, lockfile);
}

export async function syncManagedSkills(entries, { repoRoot, prune = true } = {}) {
  const normalizedEntries = entries.map(normalizeEntry);
  validateEntries(normalizedEntries);

  const lockfile = await readLockfile(repoRoot);
  const desiredKeys = new Set(
    normalizedEntries.map((entry) => makeSkillKey(entry.scope, entry.platform, entry.name))
  );
  const results = [];
  const failures = [];
  let changed = false;

  for (const entry of normalizedEntries) {
    try {
      const result = await syncEntry(repoRoot, entry, lockfile);
      results.push(result);
      if (result.action !== 'skipped') {
        changed = true;
      }
    } catch (error) {
      failures.push({
        stage: 'sync',
        entry,
        error,
      });
    }
  }

  if (prune) {
    const removed = await pruneRemovedEntries(repoRoot, desiredKeys, lockfile);
    if (removed.results.length > 0) {
      results.push(...removed.results);
      changed = true;
    }
    if (removed.failures.length > 0) {
      failures.push(...removed.failures);
    }
  }

  if (changed) {
    await writeLockfile(repoRoot, lockfile);
  }

  const summary = {
    results,
    changedCount: results.filter(
      (result) => result.action === 'installed' || result.action === 'updated'
    ).length,
    skippedCount: results.filter((result) => result.action === 'skipped').length,
    removedCount: results.filter((result) => result.action === 'removed').length,
    failureCount: failures.length,
  };

  if (failures.length > 0) {
    const error = new Error(
      `One or more skill sync operations failed:\n${failures.map(formatFailure).join('\n')}`
    );
    error.failures = failures;
    error.summary = summary;
    throw error;
  }

  return summary;
}
