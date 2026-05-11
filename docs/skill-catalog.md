# Skill Catalog

This document covers the managed skill catalog in this repo:

- `skillfile.toml`
- `skills/`
- `skill-lock.json`

It also references the project-local lock that `agh` writes when local skills are applied:

- `<project>/skills-lock.json`

Use this when changing the catalog itself. For CLI usage, see [agh.md](agh.md).

## `skillfile.toml`

`skillfile.toml` is the declarative manifest for skills managed by this repo.

It uses repeated TOML tables:

```toml
[[skills]]
url = "https://github.com/AvdLee/Swift-Concurrency-Agent-Skill"
name = "swift-concurrency"
version = "2.1.1"
scope = "local"
platform = "ios"

[[skills]]
url = "https://github.com/android/skills"
name = "android-cli"
version = "v0.0.5"
scope = "local"
platform = "android"
source_path = "devtools/android-cli"

[[skills]]
url = "https://github.com/example/repo"
name = "todo"
scope = "global"

[[skills]]
url = "https://github.com/microsoft/playwright-cli"
name = "playwright-cli"
version = "v0.1.12"
scope = "local"
platform = "web"
source_path = "skills/playwright-cli"
```

Supported fields:

- `url`: source repository URL or local path
- `name`: installed skill name
- `version`: optional tag, branch, or ref; if omitted, `agh` tracks the source repo default branch `HEAD`
- `scope`: `global` or `local`
- `platform`: required for `local`; one of `ios`, `android`, `web`
- `source_path`: optional source directory inside the upstream repo; defaults to `name`

Rules:

- one `[[skills]]` block per skill entry
- comments and blank lines are allowed
- a global skill must not define `platform`
- a local skill must define `platform`
- the same skill name cannot be declared as both `global` and `local`

## Managed Skill Tree

After sync, `agh` materializes managed copies into this repo:

```text
skills/global/
skills/ios/
skills/android/
skills/web/
```

Think of the layers this way:

- `skillfile.toml` declares intent
- `skills/` contains the managed installed copies
- `skill-lock.json` records exactly what was resolved and installed
- `skills-lock.json` in a target project records which local skills `agh` copied there

## Project `skills-lock.json`

When `agh` copies local skills into a target repo, it also writes `<project>/skills-lock.json`.

That file contains only the local skills copied by `agh`. Each entry records:

- `name`
- `version`
- `url`
- `resolvedCommit`

`agh` uses that lock to decide whether a local project skill needs to be recopied:

- copy when the skill directory is missing
- copy when the lock entry is missing
- copy when the stored metadata differs, including an older `resolvedCommit`
- skip when both the project copy and lock entry already match

## Expected Skill Format

Each installed skill directory must contain a `SKILL.md`.

`agh` validates that file before accepting a skill. At minimum, the file must start with YAML frontmatter:

```md
---
name: my-skill
description: "What this skill is for."
---
```

Validation rules enforced by `agh`:

- `name` is required
- `description` is required
- the frontmatter `name` must match the configured installed skill name
- skill names must use lowercase slash-separated segments with letters, numbers, and hyphens only

That validation is what makes this repo usable as a catalog instead of a loose collection of copied folders.
