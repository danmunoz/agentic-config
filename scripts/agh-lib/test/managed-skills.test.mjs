import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { removeManagedSkillEntry, syncManagedSkills } from '../managed-skills.mjs';
import { readLockfile } from '../lockfile.mjs';
import { createSkillSourceRepo, makeTempDir, writeFile } from './helpers.mjs';

const skillName = 'swift-concurrency';

function makeEntry(url, overrides = {}) {
  return {
    url,
    name: skillName,
    version: '',
    scope: 'local',
    platform: 'ios',
    sourcePath: skillName,
    lineNumber: 1,
    ...overrides,
  };
}

test('syncManagedSkills installs a pinned version and records the lockfile', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);

  const result = await syncManagedSkills([makeEntry(sourceRepo, { version: '2.1.1' })], {
    repoRoot,
  });

  const installedSkill = path.join(repoRoot, 'skills', 'ios', skillName, 'SKILL.md');
  const lockfile = await readLockfile(repoRoot);

  assert.equal(result.changedCount, 1);
  assert.equal(await fs.readFile(installedSkill, 'utf8').then(Boolean), true);
  assert.equal(lockfile.scopes.local.ios[skillName].requestedVersion, '2.1.1');
});

test('syncManagedSkills matches the requested version exactly', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.0',
      tag: '2.1.0',
      description: 'Old version.',
    },
    {
      label: 'v2.2.0',
      tag: '2.2.0',
      description: 'New version.',
    },
  ]);

  await syncManagedSkills([makeEntry(sourceRepo, { version: '2.2.0' })], { repoRoot });
  await syncManagedSkills([makeEntry(sourceRepo, { version: '2.1.0' })], { repoRoot });

  const installedSkill = await fs.readFile(
    path.join(repoRoot, 'skills', 'ios', skillName, 'SKILL.md'),
    'utf8'
  );
  const lockfile = await readLockfile(repoRoot);

  assert.match(installedSkill, /Version 2.1.0/);
  assert.equal(lockfile.scopes.local.ios[skillName].requestedVersion, '2.1.0');
});

test('syncManagedSkills skips head installs when HEAD and files are unchanged', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'main',
      description: 'HEAD install.',
    },
  ]);

  const entry = makeEntry(sourceRepo);
  await syncManagedSkills([entry], { repoRoot });
  const result = await syncManagedSkills([entry], { repoRoot });

  assert.equal(result.changedCount, 0);
  assert.equal(result.skippedCount, 1);
});

test('syncManagedSkills reinstalls when tracked files are missing', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'main',
      description: 'HEAD install.',
      extraFile: {
        name: 'notes.txt',
        content: 'restore me\n',
      },
    },
  ]);

  const entry = makeEntry(sourceRepo);
  await syncManagedSkills([entry], { repoRoot });
  await fs.rm(path.join(repoRoot, 'skills', 'ios', skillName), { recursive: true, force: true });

  const result = await syncManagedSkills([entry], { repoRoot });

  assert.equal(result.changedCount, 1);
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'skills', 'ios', skillName, 'notes.txt'), 'utf8'),
    'restore me\n'
  );
});

test('syncManagedSkills overwrites unmanaged directories', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);
  const unmanagedDir = path.join(repoRoot, 'skills', 'ios', skillName);

  await writeFile(path.join(unmanagedDir, 'SKILL.md'), '# Old\n');
  await writeFile(path.join(unmanagedDir, 'old.txt'), 'remove me\n');

  await syncManagedSkills([makeEntry(sourceRepo, { version: '2.1.1' })], { repoRoot });

  assert.match(
    await fs.readFile(path.join(unmanagedDir, 'SKILL.md'), 'utf8'),
    /Concurrency guidance/
  );
  await assert.rejects(fs.access(path.join(unmanagedDir, 'old.txt')));
});

test('syncManagedSkills prunes removed entries from disk and lockfile', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);

  await syncManagedSkills([makeEntry(sourceRepo, { version: '2.1.1' })], { repoRoot });
  const result = await syncManagedSkills([], { repoRoot });
  const lockfile = await readLockfile(repoRoot);

  assert.equal(result.removedCount, 1);
  await assert.rejects(fs.access(path.join(repoRoot, 'skills', 'ios', skillName)));
  assert.equal(lockfile.scopes.local.ios[skillName], undefined);
});

test('syncManagedSkills rejects global plus local duplicates for the same skill', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);

  await assert.rejects(
    syncManagedSkills(
      [
        makeEntry(sourceRepo, { version: '2.1.1', scope: 'global', platform: null, lineNumber: 1 }),
        makeEntry(sourceRepo, { version: '2.1.1', scope: 'local', platform: 'ios', lineNumber: 2 }),
      ],
      { repoRoot }
    ),
    /cannot be listed as both global and local/
  );
});

test('syncManagedSkills writes successful changes even when other entries fail', async () => {
  const repoRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);

  await assert.rejects(
    syncManagedSkills(
      [
        makeEntry(sourceRepo, { version: '2.1.1', scope: 'local', platform: 'ios', lineNumber: 1 }),
        {
          url: path.join(repoRoot, 'missing-repo'),
          name: 'broken-skill',
          version: '1.0.0',
          scope: 'local',
          platform: 'android',
          sourcePath: 'broken-skill',
          lineNumber: 2,
        },
      ],
      { repoRoot }
    ),
    /broken-skill/
  );

  const lockfile = await readLockfile(repoRoot);
  assert.equal(lockfile.scopes.local.ios[skillName].requestedVersion, '2.1.1');
  assert.equal(
    await fs.readFile(path.join(repoRoot, 'skills', 'ios', skillName, 'SKILL.md'), 'utf8').then(Boolean),
    true
  );
});

test('syncManagedSkills accepts nested skill names', async () => {
  const repoRoot = await makeTempDir();
  const nestedSkillName = 'navigation-3';
  const sourceRepo = await createSkillSourceRepo(nestedSkillName, [
    {
      label: 'v0.0.5',
      tag: '0.0.5',
      description: 'Nested Android skill.',
      sourcePath: 'navigation/navigation-3',
    },
  ]);

  const result = await syncManagedSkills(
    [
      {
        url: sourceRepo,
        name: nestedSkillName,
        version: '0.0.5',
        scope: 'local',
        platform: 'android',
        sourcePath: 'navigation/navigation-3',
        lineNumber: 1,
      },
    ],
    { repoRoot }
  );

  assert.equal(result.changedCount, 1);
  assert.equal(
    await fs.readFile(
      path.join(repoRoot, 'skills', 'android', 'navigation-3', 'SKILL.md'),
      'utf8'
    ).then(Boolean),
    true
  );
});

test('removeManagedSkillEntry removes the local repo copy and skills-lock entry', async () => {
  const repoRoot = await makeTempDir();
  const projectRoot = await makeTempDir();
  const sourceRepo = await createSkillSourceRepo(skillName, [
    {
      label: 'v2.1.1',
      tag: '2.1.1',
      description: 'Concurrency guidance.',
    },
  ]);

  await syncManagedSkills([makeEntry(sourceRepo, { version: '2.1.1' })], { repoRoot });
  await writeFile(path.join(projectRoot, '.agents', 'skills', skillName, 'SKILL.md'), '# Local copy\n');
  const lockfile = await readLockfile(repoRoot);
  await writeFile(
    path.join(projectRoot, 'skills-lock.json'),
    `${JSON.stringify(
      [
        {
          name: skillName,
          version: '2.1.1',
          url: sourceRepo,
          resolvedCommit: lockfile.scopes.local.ios[skillName].resolvedCommit,
        },
      ],
      null,
      2
    )}\n`
  );

  await removeManagedSkillEntry(makeEntry(sourceRepo, { version: '2.1.1' }), {
    repoRoot,
    projectRoot,
  });

  await assert.rejects(fs.access(path.join(projectRoot, '.agents', 'skills', skillName)));
  await assert.rejects(fs.access(path.join(projectRoot, 'skills-lock.json')));
});
