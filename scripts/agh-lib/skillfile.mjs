import fs from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import {
  LEGACY_SKILL_TYPES,
  LOCAL_SKILL_PLATFORMS,
  SKILL_SCOPES,
} from './constants.mjs';

function findLineNumber(content, entry) {
  const lines = content.split(/\r?\n/);
  const headerPattern = /^\s*\[\[skills\]\]\s*$/;
  let current = {};
  let currentLine = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (headerPattern.test(trimmed)) {
      current = {};
      currentLine = index + 1;
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*"((?:\\"|\\\\|[^"])*)"\s*$/);
    if (!match || currentLine === null) {
      continue;
    }

    current[match[1]] = match[2]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');

    const normalized = normalizeManifestEntry(current, currentLine, {
      allowLegacy: true,
      validate: false,
    });
    if (
      normalized.url === entry.url &&
      normalized.name === entry.name &&
      normalized.version === entry.version &&
      normalized.scope === entry.scope &&
      normalized.platform === entry.platform &&
      normalized.sourcePath === entry.sourcePath
    ) {
      return currentLine;
    }
  }

  return 1;
}

function normalizeManifestEntry(entry, lineNumber, { allowLegacy, validate }) {
  const url = entry.url ?? '';
  const name = entry.name ?? '';
  const version = entry.version ?? '';
  const legacyType = entry.type ?? '';
  const scope = entry.scope ?? (legacyType === 'global' ? 'global' : legacyType ? 'local' : '');
  const platform = entry.platform ?? (legacyType && legacyType !== 'global' ? legacyType : null);
  const sourcePath = entry.source_path || name;

  if (!validate) {
    return {
      url,
      name,
      version,
      scope,
      platform,
      sourcePath,
      lineNumber,
    };
  }

  if (typeof url !== 'string' || url === '') {
    throw new Error(`skillfile line ${lineNumber}: url is required.`);
  }
  if (typeof name !== 'string' || name === '') {
    throw new Error(`skillfile line ${lineNumber}: name is required.`);
  }
  if (version !== '' && typeof version !== 'string') {
    throw new Error(`skillfile line ${lineNumber}: version must be a string.`);
  }
  if (typeof scope !== 'string' || !SKILL_SCOPES.includes(scope)) {
    throw new Error(
      `skillfile line ${lineNumber}: invalid scope "${scope}". Expected one of: ${SKILL_SCOPES.join(', ')}.`
    );
  }

  if (platform !== null && platform !== undefined && typeof platform !== 'string') {
    throw new Error(`skillfile line ${lineNumber}: platform must be a string when provided.`);
  }

  if (scope === 'global') {
    if (platform) {
      throw new Error(`skillfile line ${lineNumber}: global skills must not define a platform.`);
    }
  } else if (!LOCAL_SKILL_PLATFORMS.includes(platform)) {
    throw new Error(
      `skillfile line ${lineNumber}: local skills must define a platform from: ${LOCAL_SKILL_PLATFORMS.join(', ')}.`
    );
  }

  if (typeof sourcePath !== 'string' || sourcePath === '') {
    throw new Error(`skillfile line ${lineNumber}: source_path must be a non-empty string.`);
  }

  if (!allowLegacy && legacyType) {
    throw new Error(
      `skillfile line ${lineNumber}: use "scope" and "platform" instead of legacy "type".`
    );
  }

  if (legacyType && !LEGACY_SKILL_TYPES.includes(legacyType)) {
    throw new Error(
      `skillfile line ${lineNumber}: invalid legacy type "${legacyType}". Expected one of: ${LEGACY_SKILL_TYPES.join(', ')}.`
    );
  }

  return {
    url,
    name,
    version,
    scope,
    platform,
    sourcePath,
    lineNumber,
  };
}

function entrySortKey(entry) {
  const scopeRank = entry.scope === 'global' ? 0 : 1;
  const platformRank =
    entry.scope === 'global'
      ? -1
      : LOCAL_SKILL_PLATFORMS.indexOf(entry.platform ?? '');
  return [scopeRank, platformRank, entry.name, entry.url];
}

export function compareSkillEntries(left, right) {
  const leftKey = entrySortKey(left);
  const rightKey = entrySortKey(right);

  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] < rightKey[index]) return -1;
    if (leftKey[index] > rightKey[index]) return 1;
  }
  return 0;
}

export function sortSkillEntries(entries) {
  return [...entries].sort(compareSkillEntries);
}

export function sameSkillEntry(left, right) {
  return (
    left.url === right.url &&
    left.name === right.name &&
    left.version === right.version &&
    left.scope === right.scope &&
    (left.platform ?? null) === (right.platform ?? null) &&
    left.sourcePath === right.sourcePath
  );
}

export function renderSkillfile(entries) {
  const sortedEntries = sortSkillEntries(entries);
  const blocks = sortedEntries.map((entry) => {
    const lines = [
      '[[skills]]',
      `url = ${JSON.stringify(entry.url)}`,
      `name = ${JSON.stringify(entry.name)}`,
    ];

    if (entry.version) {
      lines.push(`version = ${JSON.stringify(entry.version)}`);
    }

    lines.push(`scope = ${JSON.stringify(entry.scope)}`);

    if (entry.scope === 'local') {
      lines.push(`platform = ${JSON.stringify(entry.platform)}`);
    }

    if (entry.sourcePath && entry.sourcePath !== entry.name) {
      lines.push(`source_path = ${JSON.stringify(entry.sourcePath)}`);
    }

    return lines.join('\n');
  });

  return `${blocks.join('\n\n')}\n`;
}

export async function writeSkillfile(skillfilePath, entries) {
  const output = renderSkillfile(entries);
  await fs.writeFile(skillfilePath, output, 'utf8');
}

export function parseSkillfile(content) {
  let parsed;
  try {
    parsed = parseToml(content);
  } catch (error) {
    throw new Error(`Invalid skillfile.toml: ${error.message}`);
  }

  if (!Array.isArray(parsed.skills)) {
    throw new Error('skillfile.toml must define a [[skills]] array.');
  }

  return parsed.skills.map((entry) => {
    const normalized = normalizeManifestEntry(entry, 1, { allowLegacy: true, validate: false });
    const lineNumber = findLineNumber(content, normalized);
    return normalizeManifestEntry(entry, lineNumber, { allowLegacy: true, validate: true });
  });
}

export async function readSkillfile(skillfilePath) {
  const content = await fs.readFile(skillfilePath, 'utf8');
  return parseSkillfile(content);
}
