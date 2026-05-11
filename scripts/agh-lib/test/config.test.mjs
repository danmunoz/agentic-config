import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configureAgentInstructions, configureGlobalSkills } from '../config.mjs';
import { makeRepoFixture, makeTempDir } from './helpers.mjs';

async function readResolvedLink(linkPath) {
  const target = await fs.readlink(linkPath);
  return path.resolve(path.dirname(linkPath), target);
}

test('configureAgentInstructions links all supported agent files into home', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();

  const results = await configureAgentInstructions({ repoRoot, homeDir });

  assert.equal(results.length, 3);
  assert.equal(
    await readResolvedLink(path.join(homeDir, '.codex', 'AGENTS.md')),
    path.join(repoRoot, 'AGENTS.MD')
  );
  assert.equal(
    await readResolvedLink(path.join(homeDir, '.claude', 'CLAUDE.md')),
    path.join(repoRoot, 'AGENTS.MD')
  );
  assert.equal(
    await readResolvedLink(path.join(homeDir, '.config', 'opencode', 'AGENTS.md')),
    path.join(repoRoot, 'AGENTS.MD')
  );
});

test('configureAgentInstructions limits links to the selected tools', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();

  const results = await configureAgentInstructions({
    repoRoot,
    homeDir,
    selectedTools: ['claude', 'opencode'],
  });

  assert.equal(results.length, 2);
  await assert.rejects(fs.access(path.join(homeDir, '.codex', 'AGENTS.md')));
  assert.equal(
    await readResolvedLink(path.join(homeDir, '.claude', 'CLAUDE.md')),
    path.join(repoRoot, 'AGENTS.MD')
  );
});

test('configureGlobalSkills links shared global skills into ~/.agents/skills/custom', async () => {
  const repoRoot = await makeRepoFixture();
  const homeDir = await makeTempDir();

  await configureGlobalSkills({ repoRoot, homeDir });

  assert.equal(
    await readResolvedLink(path.join(homeDir, '.agents', 'skills', 'custom')),
    path.join(repoRoot, 'skills', 'global')
  );
});
