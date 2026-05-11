import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function run(command, args, options = {}) {
  await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
  });
}

export async function makeTempDir(prefix = 'agh-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFile(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
}

export async function makeRepoFixture() {
  const repoRoot = await makeTempDir();
  await writeFile(path.join(repoRoot, 'AGENTS.MD'), '# Instructions\n');
  await writeFile(
    path.join(repoRoot, 'skillfile.toml'),
    [
      '[[skills]]',
      'url = "https://example.com/swift-concurrency"',
      'name = "swift-concurrency"',
      'scope = "local"',
      'platform = "ios"',
      '',
      '[[skills]]',
      'url = "https://example.com/todo"',
      'name = "todo"',
      'version = "1.0.0"',
      'scope = "global"',
      '',
    ].join('\n')
  );
  await writeFile(path.join(repoRoot, 'skills', 'ios', 'swift-concurrency', 'SKILL.md'), '# A\n');
  await writeFile(path.join(repoRoot, 'skills', 'global', 'todo', 'SKILL.md'), '# B\n');
  await writeFile(
    path.join(repoRoot, 'skill-lock.json'),
    `${JSON.stringify(
      {
        version: 3,
        scopes: {
          global: {
            todo: {
              skillName: 'todo',
              scope: 'global',
              sourcePath: 'todo',
              originalUrl: 'https://example.com/todo',
              normalizedUrl: 'https://example.com/todo',
              requestedVersion: '1.0.0',
              mode: 'version',
              resolvedCommit: 'todo-commit',
              description: 'Todo skill.',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
          local: {
            ios: {
              'swift-concurrency': {
                skillName: 'swift-concurrency',
                scope: 'local',
                platform: 'ios',
                sourcePath: 'swift-concurrency',
                originalUrl: 'https://example.com/swift-concurrency',
                normalizedUrl: 'https://example.com/swift-concurrency',
                requestedVersion: null,
                mode: 'head',
                resolvedCommit: 'swift-commit',
                description: 'Swift concurrency skill.',
                updatedAt: '2026-05-11T00:00:00.000Z',
              },
            },
            android: {},
            web: {},
          },
        },
      },
      null,
      2
    )}\n`
  );
  return repoRoot;
}

export async function createSkillSourceRepo(skillName, versions, options = {}) {
  const repoDir = await makeTempDir('agh-skill-source-');
  await run('git', ['init', '-b', 'main'], { cwd: repoDir });
  await run('git', ['config', 'user.name', 'AGH Tests'], { cwd: repoDir });
  await run('git', ['config', 'user.email', 'tests@example.com'], { cwd: repoDir });

  for (const version of versions) {
    const sourcePath = version.sourcePath ?? options.sourcePath ?? skillName;
    const frontmatterName = version.frontmatterName ?? options.frontmatterName ?? skillName;
    const skillDir = path.join(repoDir, sourcePath);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: ${frontmatterName}
description: ${version.description}
---

# ${frontmatterName}

Version ${version.tag ?? version.label}
`,
      'utf8'
    );
    if (version.extraFile) {
      await fs.writeFile(
        path.join(skillDir, version.extraFile.name),
        version.extraFile.content,
        'utf8'
      );
    }

    await run('git', ['add', '.'], { cwd: repoDir });
    await run('git', ['commit', '-m', version.label], { cwd: repoDir });
    if (version.tag) {
      await run('git', ['tag', version.tag], { cwd: repoDir });
    }
  }

  return repoDir;
}

export function createUiDouble() {
  const infos = [];
  const errors = [];
  const warnings = [];
  const working = [];
  let newlineCount = 0;
  const answers = {
    select: [],
    multiselect: [],
    confirm: [],
  };

  return {
    infos,
    errors,
    warnings,
    working,
    answers,
    get newlineCount() {
      return newlineCount;
    },
    ui: {
      isInteractive: true,
      title(message) {
        infos.push(`TITLE:${message}`);
      },
      section(message) {
        infos.push(`SECTION:${message}`);
      },
      info(message) {
        infos.push(message);
      },
      success(message) {
        infos.push(message);
      },
      warn(message) {
        warnings.push(message);
      },
      error(message) {
        errors.push(message);
      },
      startWork(message) {
        working.push(`start:${message}`);
      },
      stopWork() {
        working.push('stop');
      },
      newline() {
        newlineCount += 1;
      },
      async select() {
        return answers.select.shift();
      },
      async multiselect() {
        return answers.multiselect.shift();
      },
      async confirm() {
        return answers.confirm.shift() ?? false;
      },
    },
  };
}
