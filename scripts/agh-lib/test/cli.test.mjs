import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, runCli } from '../cli.mjs';
import { createUiDouble, makeRepoFixture, makeTempDir, writeFile } from './helpers.mjs';

test('parseArgs shows help when no command is provided', () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.help, true);
});

test('parseArgs accepts tool filters for install and set-config', () => {
  const parsed = parseArgs(['set-config', '--tools', 'codex,opencode']);
  assert.deepEqual(parsed.selectedTools, ['codex', 'opencode']);
});

test('parseArgs accepts --platforms and legacy --types for set-skills', () => {
  assert.deepEqual(parseArgs(['set-skills', '--platforms', 'ios,web']).selectedPlatforms, ['ios', 'web']);
  assert.deepEqual(parseArgs(['set-skills', '--types', 'ios']).selectedPlatforms, ['ios']);
});

test('parseArgs supports add and remove flags', () => {
  const addParsed = parseArgs([
    'add',
    'https://example.com/repo',
    '--skill',
    'alpha',
    '--scope',
    'local',
    '--platform',
    'ios',
    '--source-path',
    'skills/alpha',
  ]);
  assert.equal(addParsed.url, 'https://example.com/repo');
  assert.equal(addParsed.skill, 'alpha');
  assert.equal(addParsed.scope, 'local');
  assert.equal(addParsed.platform, 'ios');
  assert.equal(addParsed.sourcePath, 'skills/alpha');

  const removeParsed = parseArgs(['remove', '--name', 'alpha', '--scope', 'global']);
  assert.equal(removeParsed.skill, 'alpha');
  assert.equal(removeParsed.scope, 'global');
});

test('parseArgs supports list and available flag', () => {
  assert.equal(parseArgs(['list']).command, 'list');
  assert.equal(parseArgs(['list', 'available']).available, true);
  assert.equal(parseArgs(['list', '--available']).available, true);
});

test('runCli install updates both zsh startup files and selected config links', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();
  const double = createUiDouble();
  double.answers.multiselect.push(['codex', 'opencode']);

  const exitCode = await runCli(['install'], { repoRoot, homeDir, ui: double.ui });

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.match(await fs.readFile(path.join(homeDir, '.zshrc'), 'utf8'), /agh install/);
  assert.match(await fs.readFile(path.join(homeDir, '.zprofile'), 'utf8'), /agh install/);
  assert.equal(
    path.resolve(
      path.dirname(path.join(homeDir, '.codex', 'AGENTS.md')),
      await fs.readlink(path.join(homeDir, '.codex', 'AGENTS.md'))
    ),
    path.join(repoRoot, 'AGENTS.MD')
  );
  await assert.rejects(fs.access(path.join(homeDir, '.claude', 'CLAUDE.md')));
});

test('runCli set-config accepts explicit tool flags in non-interactive flows', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();
  const { ui, errors } = createUiDouble();

  const exitCode = await runCli(['set-config', '--tools', 'claude'], {
    repoRoot,
    homeDir,
    ui,
  });

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
  assert.equal(
    path.resolve(
      path.dirname(path.join(homeDir, '.claude', 'CLAUDE.md')),
      await fs.readlink(path.join(homeDir, '.claude', 'CLAUDE.md'))
    ),
    path.join(repoRoot, 'AGENTS.MD')
  );
  await assert.rejects(fs.access(path.join(homeDir, '.codex', 'AGENTS.md')));
});

test('runCli set-skills accepts explicit flags in non-interactive flows', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();

  const exitCode = await runCli(
    ['set-skills', '--scope', 'both', '--platforms', 'ios', '--yes'],
    {
      repoRoot,
      homeDir,
      cwd: projectRoot,
      ui: double.ui,
      syncSkills: async () => ({
        changedCount: 2,
        removedCount: 0,
        skippedCount: 0,
        failureCount: 0,
        results: [],
      }),
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('TITLE:Set Up Skills'));
  assert.ok(
    double.infos.includes(
      'Sync managed skills from skillfile.toml, then link global skills and/or copy local platform skills into this repo.'
    )
  );
  assert.ok(double.infos.includes('SECTION:Plan'));
  assert.ok(
    double.infos.includes(
      'Scope: global + local\nLocal platforms: ios\nDestinations: ~/.agents/skills/custom, .agents/skills/\nWill link: todo\nWill copy: swift-concurrency'
    )
  );
  assert.deepEqual(double.working, [
    'start:Syncing managed skills and applying your selected scope...',
    'stop',
  ]);
  assert.ok(double.infos.includes('Managed sync: 2 updated, 0 removed, 0 already current.'));
  assert.ok(double.infos.includes('Global skills are linked.'));
  assert.ok(double.infos.includes('Copied into this repo: swift-concurrency'));
  assert.equal(
    await fs.readFile(
      path.join(projectRoot, '.agents', 'skills', 'swift-concurrency', 'SKILL.md'),
      'utf8'
    ),
    '# A\n'
  );
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

test('runCli set-skills uses interactive answers when flags are omitted', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();
  double.answers.select.push('local');
  double.answers.multiselect.push(['ios']);
  double.answers.confirm.push(true);

  const exitCode = await runCli(['set-skills'], {
    repoRoot,
    homeDir,
    cwd: projectRoot,
    ui: double.ui,
    syncSkills: async () => ({
      changedCount: 1,
      removedCount: 0,
      skippedCount: 1,
      failureCount: 0,
      results: [],
    }),
  });

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('SECTION:Plan'));
  assert.ok(
    double.infos.includes(
      'Scope: local\nLocal platforms: ios\nDestination: .agents/skills/\nWill copy: swift-concurrency'
    )
  );
  assert.deepEqual(double.working, [
    'start:Syncing managed skills and applying your selected scope...',
    'stop',
  ]);
  assert.ok(double.infos.includes('Managed sync: 1 updated, 0 removed, 1 already current.'));
  assert.ok(double.infos.includes('Copied into this repo: swift-concurrency'));
  assert.ok(double.newlineCount >= 3);
  assert.equal(
    await fs.readFile(
      path.join(projectRoot, '.agents', 'skills', 'swift-concurrency', 'SKILL.md'),
      'utf8'
    ),
    '# A\n'
  );
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

test('runCli list shows global skills and missing local repo lockfile', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();

  const exitCode = await runCli(['list'], {
    repoRoot,
    cwd: projectRoot,
    ui: double.ui,
  });

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('TITLE:Skill List'));
  assert.ok(double.infos.includes('Global skills from skillfile.toml:'));
  assert.ok(double.infos.includes('- todo'));
  assert.ok(double.infos.includes('Local skills in current repo:'));
  assert.ok(double.infos.includes('- No local skills found in current repo.'));
});

test('runCli list available shows all skillfile entries and local repo skills', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();

  await writeFile(
    path.join(projectRoot, 'skills-lock.json'),
    `${JSON.stringify(
      [
        {
          name: 'swift-concurrency',
          version: null,
          url: 'https://example.com/swift-concurrency',
          resolvedCommit: 'swift-commit',
        },
      ],
      null,
      2
    )}\n`
  );

  const exitCode = await runCli(['list', 'available'], {
    repoRoot,
    cwd: projectRoot,
    ui: double.ui,
  });

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('Available skills from skillfile.toml:'));
  assert.ok(double.infos.includes('- todo (global)\n- swift-concurrency (local/ios)'));
  assert.ok(double.infos.includes('Local skills in current repo:'));
  assert.ok(double.infos.includes('- swift-concurrency'));
});

test('runCli add prompts for missing scope and platform, then installs and applies', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const homeDir = await makeTempDir();
  const double = createUiDouble();
  double.answers.select.push('local');
  double.answers.select.push('ios');
  double.answers.confirm.push(true);
  const writtenStates = [];
  const calls = [];

  const exitCode = await runCli(
    ['add', 'https://example.com/new-skill', '--skill', 'new-skill'],
    {
      repoRoot,
      cwd: projectRoot,
      homeDir,
      ui: double.ui,
      deps: {
        async readSkillfile() {
          return [];
        },
        async writeSkillfile(_path, entries) {
          writtenStates.push(entries.map((entry) => ({ ...entry })));
        },
        async validateManagedSkillEntry(entry) {
          calls.push(['validate', entry]);
        },
        async installManagedSkillEntry(entry) {
          calls.push(['install', entry]);
          return { action: 'installed' };
        },
        async collectSkillSources() {
          return [{ name: 'new-skill', path: '/tmp/new-skill', platform: 'ios' }];
        },
        async copySkillsToProject(skillSources) {
          calls.push(['copy', skillSources.map((skill) => skill.name)]);
          return {
            copied: [{ name: 'new-skill' }],
            skipped: [],
          };
        },
        async configureGlobalSkills() {
          calls.push(['link-global']);
        },
      },
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('TITLE:Add Skill'));
  assert.ok(double.infos.includes('SECTION:Plan'));
  assert.ok(
    double.infos.includes(
      'Skill: new-skill\nURL: https://example.com/new-skill\nScope: local\nPlatform: ios\nDestination: .agents/skills/\nWill copy: new-skill'
    )
  );
  assert.deepEqual(calls.map((call) => call[0]), ['validate', 'install', 'copy']);
  assert.equal(writtenStates.length, 1);
  assert.ok(double.infos.includes('Copied into this repo: new-skill'));
});

test('runCli add no-ops when the exact manifest entry already exists', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();

  const existingEntry = {
    url: 'https://example.com/swift-concurrency',
    name: 'swift-concurrency',
    version: '',
    scope: 'local',
    platform: 'ios',
    sourcePath: 'swift-concurrency',
    lineNumber: 1,
  };

  const exitCode = await runCli(
    ['add', 'https://example.com/swift-concurrency', '--skill', 'swift-concurrency', '--scope', 'local', '--platform', 'ios'],
    {
      repoRoot,
      cwd: projectRoot,
      homeDir,
      ui: double.ui,
      deps: {
        async readSkillfile() {
          return [existingEntry];
        },
      },
    }
  );

  assert.equal(exitCode, 0);
  assert.ok(double.infos.includes('Skill "swift-concurrency" is already present in skillfile.toml.'));
});

test('runCli remove lets the user choose when multiple matches exist', async () => {
  const repoRoot = await makeRepoFixture();
  const projectRoot = await makeTempDir();
  const double = createUiDouble();
  double.answers.select.push('0');
  double.answers.confirm.push(true);
  const writtenStates = [];
  const removals = [];

  const entries = [
    {
      url: 'https://example.com/swift-concurrency',
      name: 'swift-concurrency',
      version: '',
      scope: 'local',
      platform: 'ios',
      sourcePath: 'swift-concurrency',
      lineNumber: 1,
    },
    {
      url: 'https://example.com/swift-concurrency',
      name: 'swift-concurrency',
      version: '',
      scope: 'local',
      platform: 'web',
      sourcePath: 'swift-concurrency',
      lineNumber: 2,
    },
  ];

  const exitCode = await runCli(
    ['remove', '--skill', 'swift-concurrency'],
    {
      repoRoot,
      cwd: projectRoot,
      ui: double.ui,
      deps: {
        async readSkillfile() {
          return entries;
        },
        async writeSkillfile(_path, nextEntries) {
          writtenStates.push(nextEntries.map((entry) => ({ ...entry })));
        },
        async removeManagedSkillEntry(entry) {
          removals.push(entry);
        },
      },
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(double.errors.length, 0);
  assert.ok(double.infos.includes('TITLE:Remove Skill'));
  assert.ok(double.infos.includes('SECTION:Plan'));
  assert.ok(
    double.infos.includes(
      'Skill: swift-concurrency\nURL: https://example.com/swift-concurrency\nScope: local\nPlatform: ios\nWill remove from: skillfile.toml, skill-lock.json, skills/<platform>/, .agents/skills/, skills-lock.json'
    )
  );
  assert.equal(writtenStates[0].length, 1);
  assert.equal(removals[0].platform, 'ios');
});
