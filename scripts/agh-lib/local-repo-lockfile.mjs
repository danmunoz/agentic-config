import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_REPO_LOCKFILE_NAME } from './constants.mjs';
import { pathExists } from './utils.mjs';

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (
    typeof entry.name !== 'string' ||
    typeof entry.url !== 'string' ||
    typeof entry.resolvedCommit !== 'string'
  ) {
    return null;
  }

  if (!(typeof entry.version === 'string' || entry.version === null)) {
    return null;
  }

  return {
    name: entry.name,
    version: entry.version,
    url: entry.url,
    resolvedCommit: entry.resolvedCommit,
  };
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

export function getLocalRepoLockfilePath(projectRoot) {
  return path.join(projectRoot, LOCAL_REPO_LOCKFILE_NAME);
}

export async function localRepoLockfileExists(projectRoot) {
  return pathExists(getLocalRepoLockfilePath(projectRoot));
}

export async function readLocalRepoLockfile(projectRoot) {
  const lockfilePath = getLocalRepoLockfilePath(projectRoot);

  try {
    const raw = await fs.readFile(lockfilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${LOCAL_REPO_LOCKFILE_NAME} must contain a JSON array.`);
    }

    const normalized = parsed.map(normalizeEntry);
    if (normalized.some((entry) => entry === null)) {
      throw new Error(`Invalid entry found in ${LOCAL_REPO_LOCKFILE_NAME}.`);
    }

    return sortEntries(normalized);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }

    throw new Error(`Failed to read ${LOCAL_REPO_LOCKFILE_NAME}: ${error.message}`);
  }
}

export async function writeLocalRepoLockfile(projectRoot, entries) {
  const lockfilePath = getLocalRepoLockfilePath(projectRoot);
  const normalized = entries.map(normalizeEntry);
  if (normalized.some((entry) => entry === null)) {
    throw new Error(`Invalid ${LOCAL_REPO_LOCKFILE_NAME} contents.`);
  }

  if (normalized.length === 0) {
    await fs.rm(lockfilePath, { force: true });
    return;
  }

  await fs.writeFile(lockfilePath, `${JSON.stringify(sortEntries(normalized), null, 2)}\n`, 'utf8');
}

export function findLocalRepoInstall(entries, skillName) {
  return entries.find((entry) => entry.name === skillName) ?? null;
}

export function upsertLocalRepoInstall(entries, nextEntry) {
  const normalized = normalizeEntry(nextEntry);
  if (!normalized) {
    throw new Error(`Invalid ${LOCAL_REPO_LOCKFILE_NAME} entry for "${nextEntry?.name ?? 'unknown'}".`);
  }

  const nextEntries = entries.filter((entry) => entry.name !== normalized.name);
  nextEntries.push(normalized);
  return sortEntries(nextEntries);
}

export function removeLocalRepoInstall(entries, skillName) {
  return sortEntries(entries.filter((entry) => entry.name !== skillName));
}
