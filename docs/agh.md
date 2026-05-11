# agh Command Reference

`agh` stands for Agentic Config Helper.

It is the CLI that installs and maintains the configuration stored in this repo.

## What `agh` Manages

`agh` works across two layers:

- source-of-truth layer in this repo: `AGENTS.MD`, `skillfile.toml`, `skill-lock.json`, `skills/`
- application layer on your machine or in a target project: global config symlinks, global skill symlinks, local project skill copies, local `skills-lock.json`

## Command Summary

```bash
agh install [--tools <comma-separated-tools>]
agh set-config [--tools <comma-separated-tools>]
agh set-skills [--scope <global|local|both>] [--platforms <comma-separated-platforms>] [--yes]
agh list [available|--available]
agh add <url> --skill <name> [--version <ref>] [--scope <global|local>] [--platform <platform>] [--source-path <path>] [--yes]
agh remove --skill <name> [--scope <global|local>] [--platform <platform>] [--url <url>] [--yes]
```

Supported tools:

- `codex`
- `claude`
- `opencode`

Supported local platforms:

- `ios`
- `android`
- `web`

## `agh install`

Use this for first-time machine setup.

```bash
agh install
```

What it does:

- updates or inserts one managed `PATH` block in `~/.zshrc`
- updates or inserts the same managed `PATH` block in `~/.zprofile`
- asks which tools to configure unless `--tools` is provided
- replaces the selected tool instruction files with symlinks to this repo's `AGENTS.MD`

What it does not do:

- it does not install skills
- it does not modify `skillfile.toml`

When to use it:

- on a new machine
- after cloning this repo in a new location
- after deleting the managed PATH block
- when you want `agh` available globally

Examples:

```bash
./scripts/agh install
agh install --tools codex,claude
agh install --tools opencode
```

Managed tool targets:

- Codex: `~/.codex/AGENTS.md`
- Claude: `~/.claude/CLAUDE.md`
- OpenCode: `~/.config/opencode/AGENTS.md`

Notes:

- the command is idempotent
- existing managed PATH blocks are updated in place
- target instruction files are replaced with symlinks

## `agh set-config`

Use this when you only want to reapply the global instruction-file symlinks.

```bash
agh set-config
```

What it does:

- links this repo's `AGENTS.MD` into the selected tool config locations
- does not touch shell PATH
- does not touch skills

When to use it:

- when a managed instruction symlink is missing or broken
- after installing a newly supported tool
- after a tool overwrites its instruction file
- after moving this repo to a new path

Examples:

```bash
agh set-config
agh set-config --tools codex
agh set-config --tools claude,opencode
```

Note:

- normal edits to `AGENTS.MD` do not require `agh set-config` because the configured tool files are symlinks to this repo copy

## `agh set-skills`

Use this to sync the canonical skill catalog and apply it either globally, locally, or both.

```bash
agh set-skills --scope <global|local|both> [--platforms ios,android,web] [--yes]
```

What it does:

- reads `skillfile.toml`
- validates the manifest
- syncs managed skill directories into this repo's `skills/`
- writes or updates `skill-lock.json`
- removes managed skills that no longer exist in the manifest
- links global skills into `~/.agents/skills/custom` when scope includes `global`
- copies local platform skills into `<current-working-directory>/.agents/skills/` when scope includes `local`
- writes or updates `<current-working-directory>/skills-lock.json` for local copies managed by `agh`

Scope behavior:

- `global`: install only shared skills for all projects
- `local`: copy only platform-specific local skills into the current project
- `both`: do both in one run

Platform behavior:

- `--platforms` matters only for `local` or `both`
- valid platforms: `ios`, `android`, `web`
- if the same skill name exists in more than one selected platform, the command fails to avoid ambiguous copies
- local copy decisions use `skills-lock.json`; `agh` recopies only when the project copy is missing or the resolved commit changed

When to use it:

- after changing `skillfile.toml`
- after pulling repo updates that changed skills
- when setting up a project for a specific platform
- when you want to refresh local `.agents/skills/` from the canonical catalog

Examples:

```bash
agh set-skills --scope global
agh set-skills --scope local --platforms ios
agh set-skills --scope both --platforms android --yes
agh set-skills --scope local --platforms ios,web
```

## `agh list`

Use this to inspect the catalog and the local skills already applied in the current repo.

```bash
agh list [available|--available]
```

What it does:

- reads `skillfile.toml`
- by default, prints the global skills declared there
- when `available` is passed, prints all skill entries declared there, including local platform skills
- checks `<current-working-directory>/skills-lock.json`
- if that lockfile exists, prints the local skills currently recorded for this repo
- if that lockfile does not exist, prints that no local skills were found in the current repo

When to use it:

- before running `agh set-skills`
- when checking whether a repo already has local skills applied
- when reviewing the current catalog

Examples:

```bash
agh list
agh list available
agh list --available
```

## `agh add`

Use this to add a new skill to the canonical manifest and install it immediately.

```bash
agh add <url> --skill <name> [--version <ref>] [--scope <global|local>] [--platform <platform>] [--source-path <path>] [--yes]
```

What it does:

- validates the requested skill before changing the manifest
- adds the new entry to `skillfile.toml`
- installs or syncs the skill into this repo's managed `skills/` tree
- updates `skill-lock.json`
- applies the result immediately

Immediate apply behavior:

- for `global` skills, it links `skills/global` into `~/.agents/skills/custom`
- for `local` skills, it copies the installed skill into the current project's `.agents/skills/` and records it in `skills-lock.json`

When to use it:

- when adopting a new skill repository
- when pinning a known version of a skill
- when adding a platform-specific skill to the catalog

Examples:

```bash
agh add https://github.com/AvdLee/Swift-Concurrency-Agent-Skill \
  --skill swift-concurrency \
  --version 2.1.1 \
  --scope local \
  --platform ios

agh add https://github.com/android/skills \
  --skill android-cli \
  --version v0.0.5 \
  --scope local \
  --platform android \
  --source-path devtools/android-cli

agh add https://github.com/example/repo \
  --skill todo \
  --scope global
```

Important rules:

- `--skill` is required
- `--platform` is required when `scope=local`
- `--source-path` defaults to the skill name
- the same skill name cannot exist as both `global` and `local`
- adding an identical existing entry is a no-op

## `agh remove`

Use this to remove a skill from the canonical manifest and its managed installs.

```bash
agh remove --skill <name> [--scope <global|local>] [--platform <platform>] [--url <url>] [--yes]
```

What it does:

- removes the matching entry from `skillfile.toml`
- removes the managed copy from this repo's `skills/`
- removes the lockfile entry from `skill-lock.json`
- removes the local project copy from `.agents/skills/<name>` when deleting a local skill and running from a project
- removes the matching project entry from `skills-lock.json`

When to use it:

- when a skill is no longer part of the catalog
- when replacing a skill with a different upstream source
- when cleaning up obsolete platform-specific skills

Examples:

```bash
agh remove --skill swift-concurrency --scope local --platform ios
agh remove --skill android-cli --scope local --platform android
agh remove --skill todo --scope global
```

Notes:

- if more than one manifest entry matches, interactive mode asks you to choose
- non-interactive mode fails until you narrow the selector
- confirmation is required unless you pass `--yes`

## Typical `agh` Flows

### Machine bootstrap

```bash
cd ~/Repos/agentic-config
npm install
./scripts/agh install --tools codex,claude,opencode
agh set-skills --scope global
```

### Project bootstrap for iOS

```bash
cd ~/Repos/my-ios-app
agh set-skills --scope local --platforms ios
```

### Add a new Android skill and apply it immediately

```bash
cd ~/Repos/my-android-app
agh add https://github.com/android/skills \
  --skill navigation-3 \
  --version v0.0.5 \
  --scope local \
  --platform android \
  --source-path navigation/navigation-3
```

### Refresh after pulling updates

```bash
cd ~/Repos/agentic-config
agh set-skills --scope global

cd ~/Repos/my-web-app
agh set-skills --scope local --platforms web
```

Only rerun `agh set-config` here if instruction symlinks need to be repaired or updated.
