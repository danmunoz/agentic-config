import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applySkillSetup,
  collectSkillSources,
  copySkillsToProject,
  listGlobalSkillNames,
} from '../skills.mjs';
import { makeRepoFixture, makeTempDir, writeFile } from './helpers.mjs';

test('collectSkillSources rejects duplicate skill names across selected local platforms', async () => {
  const repoRoot = await makeRepoFixture();
  await writeFile(path.join(repoRoot, 'skills', 'web', 'swift-concurrency', 'SKILL.md'), '# Duplicate\n');

  await assert.rejects(
    collectSkillSources(repoRoot, ['ios', 'web']),
    /exists in both "ios" and "web"/i
  );
});

test('collectSkillSources includes nested skill directories', async () => {
  const repoRoot = await makeRepoFixture();
  await writeFile(
    path.join(repoRoot, 'skills', 'android', 'navigation', 'navigation-3', 'SKILL.md'),
    '# Nested\n'
  );

  const sources = await collectSkillSources(repoRoot, ['android']);

  assert.deepEqual(sources, [
    {
      name: 'navigation/navigation-3',
      path: path.join(repoRoot, 'skills', 'android', 'navigation', 'navigation-3'),
      platform: 'android',
      version: null,
      url: null,
      resolvedCommit: null,
    },
  ]);
});

test('listGlobalSkillNames returns shared global skill names', async () => {
  const repoRoot = await makeRepoFixture();
  assert.deepEqual(await listGlobalSkillNames(repoRoot), ['todo']);
});

test('copySkillsToProject replaces existing project skill directories', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const targetSkillDir = path.join(projectRoot, '.agents', 'skills', 'swift-concurrency');

  await writeFile(path.join(targetSkillDir, 'SKILL.md'), '# Old\n');
  await writeFile(path.join(targetSkillDir, 'old.txt'), 'remove me\n');

  const result = await copySkillsToProject(
    [
      {
        name: 'swift-concurrency',
        path: path.join(repoRoot, 'skills', 'ios', 'swift-concurrency'),
        platform: 'ios',
        version: null,
        url: 'https://example.com/swift-concurrency',
        resolvedCommit: 'swift-commit',
      },
    ],
    projectRoot
  );

  assert.equal(result.copied.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(
    await fs.readFile(path.join(targetSkillDir, 'SKILL.md'), 'utf8'),
    '# A\n'
  );
  await assert.rejects(fs.access(path.join(targetSkillDir, 'old.txt')));
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(projectRoot, 'skills-lock.json'), 'utf8')),
    [
      {
        name: 'swift-concurrency',
        version: null,
        url: 'https://example.com/swift-concurrency',
        resolvedCommit: 'swift-commit',
      },
    ]
  );
});

test('copySkillsToProject skips when the local repo lock matches the installed skill', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();

  await copySkillsToProject(
    [
      {
        name: 'swift-concurrency',
        path: path.join(repoRoot, 'skills', 'ios', 'swift-concurrency'),
        platform: 'ios',
        version: null,
        url: 'https://example.com/swift-concurrency',
        resolvedCommit: 'swift-commit',
      },
    ],
    projectRoot
  );

  const result = await copySkillsToProject(
    [
      {
        name: 'swift-concurrency',
        path: path.join(repoRoot, 'skills', 'ios', 'swift-concurrency'),
        platform: 'ios',
        version: null,
        url: 'https://example.com/swift-concurrency',
        resolvedCommit: 'swift-commit',
      },
    ],
    projectRoot
  );

  assert.equal(result.copied.length, 0);
  assert.equal(result.skipped.length, 1);
});

test('applySkillSetup updates entries, links globals, and copies selected local skills', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const homeDir = await makeTempDir();

  const result = await applySkillSetup(
    {
      repoRoot,
      projectRoot,
      homeDir,
      scope: 'both',
      selectedPlatforms: ['ios'],
    },
    {
      syncSkills: async () => ({
        changedCount: 2,
        removedCount: 0,
        skippedCount: 0,
        failureCount: 0,
        results: [],
      }),
    }
  );

  assert.equal(result.syncResult.changedCount, 2);
  assert.equal(result.copiedSkills.length, 1);
  assert.equal(
    await fs.readFile(
      path.join(projectRoot, '.agents', 'skills', 'swift-concurrency', 'SKILL.md'),
      'utf8'
    ),
    '# A\n'
  );
});
