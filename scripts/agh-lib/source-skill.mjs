import fs from 'node:fs/promises';
import path from 'node:path';

const NAME_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error('SKILL.md is missing YAML frontmatter.');
  }
  return match[1];
}

function readFrontmatterField(frontmatter, fieldName) {
  const pattern = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
  const match = frontmatter.match(pattern);
  return match ? stripQuotes(match[1]) : null;
}

export function validateSkillName(skillName) {
  const segments = skillName.split('/');
  if (
    !skillName ||
    skillName.startsWith('/') ||
    skillName.endsWith('/') ||
    segments.some((segment) => segment === '.' || segment === '..' || !NAME_SEGMENT_PATTERN.test(segment))
  ) {
    throw new Error(
      'Invalid skill name. Use slash-separated path segments with lowercase letters, numbers, and hyphens only.'
    );
  }
}

export async function readSkillMetadata(repoDir, skillName, sourcePath = skillName) {
  const skillDir = path.join(repoDir, sourcePath);
  const skillFile = path.join(skillDir, 'SKILL.md');

  let raw;
  try {
    raw = await fs.readFile(skillFile, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(
        `Expected skill at ${path.join(sourcePath, 'SKILL.md')} in the source repository.`
      );
    }
    throw error;
  }

  const frontmatter = extractFrontmatter(raw);
  const frontmatterName = readFrontmatterField(frontmatter, 'name');
  const description = readFrontmatterField(frontmatter, 'description');

  if (!frontmatterName) {
    throw new Error('SKILL.md frontmatter is missing required field "name".');
  }
  if (!description) {
    throw new Error('SKILL.md frontmatter is missing required field "description".');
  }
  try {
    validateSkillName(frontmatterName);
  } catch {
    throw new Error(
      `SKILL.md frontmatter name "${frontmatterName}" is invalid. Expected slash-separated path segments with lowercase letters, numbers, and hyphens only.`
    );
  }
  if (frontmatterName !== skillName) {
    throw new Error(
      `Skill directory "${skillName}" does not match SKILL.md frontmatter name "${frontmatterName}".`
    );
  }

  return {
    skillDir,
    description,
  };
}
