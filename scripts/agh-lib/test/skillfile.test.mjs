import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillfile } from '../skillfile.mjs';

test('parseSkillfile accepts [[skills]] entries with scope and platform', () => {
  const entries = parseSkillfile(`
# comment
[[skills]]
url = "https://example.com/a"
name = "alpha"
scope = "local"
platform = "ios"

[[skills]]
url = "https://example.com/b"
name = "beta"
version = "1.2.3"
scope = "global"
`);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    url: 'https://example.com/a',
    name: 'alpha',
    version: '',
    scope: 'local',
    platform: 'ios',
    sourcePath: 'alpha',
    lineNumber: 3,
  });
  assert.equal(entries[1].scope, 'global');
  assert.equal(entries[1].platform, null);
});

test('parseSkillfile rejects invalid scope values', () => {
  assert.throws(
    () =>
      parseSkillfile(`
[[skills]]
url = "https://example.com/a"
name = "alpha"
scope = "workspace"
`),
    /invalid scope/i
  );
});

test('parseSkillfile rejects local entries missing platform', () => {
  assert.throws(
    () =>
      parseSkillfile(`
[[skills]]
url = "https://example.com/a"
name = "alpha"
scope = "local"
`),
    /local skills must define a platform/i
  );
});

test('parseSkillfile rejects global entries with platform', () => {
  assert.throws(
    () =>
      parseSkillfile(`
[[skills]]
url = "https://example.com/a"
name = "alpha"
scope = "global"
platform = "ios"
`),
    /global skills must not define a platform/i
  );
});

test('parseSkillfile accepts optional source_path', () => {
  const entries = parseSkillfile(`
[[skills]]
url = "https://example.com/repo"
name = "android-cli"
version = "v0.0.5"
scope = "local"
platform = "android"
source_path = "devtools/android-cli"
`);

  assert.deepEqual(entries[0], {
    url: 'https://example.com/repo',
    name: 'android-cli',
    version: 'v0.0.5',
    scope: 'local',
    platform: 'android',
    sourcePath: 'devtools/android-cli',
    lineNumber: 2,
  });
});

test('parseSkillfile accepts legacy type during transition', () => {
  const entries = parseSkillfile(`
[[skills]]
url = "https://example.com/repo"
name = "swift-concurrency"
type = "ios"
`);

  assert.deepEqual(entries[0], {
    url: 'https://example.com/repo',
    name: 'swift-concurrency',
    version: '',
    scope: 'local',
    platform: 'ios',
    sourcePath: 'swift-concurrency',
    lineNumber: 2,
  });
});
