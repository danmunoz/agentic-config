import fs from 'node:fs/promises';
import path from 'node:path';
import {
  LEGACY_LOCKFILE_NAME,
  LEGACY_SKILL_TYPES,
  LOCAL_SKILL_PLATFORMS,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
} from './constants.mjs';

function emptyLockfile() {
  return {
    version: LOCKFILE_VERSION,
    scopes: {
      global: {},
      local: Object.fromEntries(LOCAL_SKILL_PLATFORMS.map((platform) => [platform, {}])),
    },
  };
}

function normalizeV3Lockfile(parsed) {
  if (
    parsed.version !== LOCKFILE_VERSION ||
    typeof parsed.scopes !== 'object' ||
    !parsed.scopes ||
    typeof parsed.scopes.global !== 'object' ||
    !parsed.scopes.global ||
    typeof parsed.scopes.local !== 'object' ||
    !parsed.scopes.local
  ) {
    return null;
  }

  const lockfile = emptyLockfile();
  lockfile.scopes.global = parsed.scopes.global;
  for (const platform of LOCAL_SKILL_PLATFORMS) {
    const entries = parsed.scopes.local[platform];
    if (entries && typeof entries === 'object') {
      lockfile.scopes.local[platform] = entries;
    }
  }
  return lockfile;
}

function normalizeLegacyLockfile(parsed) {
  if (
    parsed.version !== 2 ||
    typeof parsed.platforms !== 'object' ||
    !parsed.platforms
  ) {
    return null;
  }

  const lockfile = emptyLockfile();
  for (const legacyType of LEGACY_SKILL_TYPES) {
    const entries = parsed.platforms[legacyType];
    if (!entries || typeof entries !== 'object') {
      continue;
    }

    if (legacyType === 'global') {
      lockfile.scopes.global = entries;
      continue;
    }

    lockfile.scopes.local[legacyType] = entries;
  }
  return lockfile;
}

async function readLockfileAt(lockfilePath) {
  const raw = await fs.readFile(lockfilePath, 'utf8');
  const parsed = JSON.parse(raw);
  return normalizeV3Lockfile(parsed) ?? normalizeLegacyLockfile(parsed);
}

export async function readLockfile(repoRoot) {
  const lockfilePath = path.join(repoRoot, LOCKFILE_NAME);
  try {
    const normalized = await readLockfileAt(lockfilePath);
    return normalized ?? emptyLockfile();
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      throw new Error(`Failed to read ${LOCKFILE_NAME}: ${error.message}`);
    }
  }

  const legacyLockfilePath = path.join(repoRoot, LEGACY_LOCKFILE_NAME);
  try {
    const normalized = await readLockfileAt(legacyLockfilePath);
    return normalized ?? emptyLockfile();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return emptyLockfile();
    }
    throw new Error(`Failed to read ${LEGACY_LOCKFILE_NAME}: ${error.message}`);
  }
}

export async function writeLockfile(repoRoot, lockfile) {
  const lockfilePath = path.join(repoRoot, LOCKFILE_NAME);
  const legacyLockfilePath = path.join(repoRoot, LEGACY_LOCKFILE_NAME);

  const sortedGlobalEntries = {};
  for (const skillName of Object.keys(lockfile.scopes.global).sort()) {
    sortedGlobalEntries[skillName] = lockfile.scopes.global[skillName];
  }

  const sortedLocalPlatforms = {};
  for (const platform of LOCAL_SKILL_PLATFORMS) {
    const entries = lockfile.scopes.local[platform] ?? {};
    const sortedEntries = {};
    for (const skillName of Object.keys(entries).sort()) {
      sortedEntries[skillName] = entries[skillName];
    }
    sortedLocalPlatforms[platform] = sortedEntries;
  }

  const output = JSON.stringify(
    {
      version: LOCKFILE_VERSION,
      scopes: {
        global: sortedGlobalEntries,
        local: sortedLocalPlatforms,
      },
    },
    null,
    2
  );

  await fs.writeFile(lockfilePath, `${output}\n`, 'utf8');
  await fs.rm(legacyLockfilePath, { force: true });
}

function getScopeBucket(lockfile, scope, platform = null) {
  if (scope === 'global') {
    return lockfile.scopes.global;
  }
  return lockfile.scopes.local[platform] ?? {};
}

export function findInstall(lockfile, scope, platform, skillName) {
  return getScopeBucket(lockfile, scope, platform)[skillName] ?? null;
}

export function removeInstall(lockfile, scope, platform, skillName) {
  delete getScopeBucket(lockfile, scope, platform)[skillName];
}

export function upsertInstall(lockfile, scope, platform, skillName, install) {
  getScopeBucket(lockfile, scope, platform)[skillName] = install;
}

export function listManagedInstalls(lockfile) {
  const installs = [];

  for (const [skillName, entry] of Object.entries(lockfile.scopes.global ?? {})) {
    installs.push({ scope: 'global', platform: null, skillName, entry });
  }

  for (const platform of LOCAL_SKILL_PLATFORMS) {
    for (const [skillName, entry] of Object.entries(lockfile.scopes.local[platform] ?? {})) {
      installs.push({ scope: 'local', platform, skillName, entry });
    }
  }

  return installs;
}
