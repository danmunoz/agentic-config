# agentic-config

Single source of truth for my agent setup.

This repo centralizes three things:

- shared agent instructions in `AGENTS.MD`
- a managed skill catalog in `skillfile.toml`, `skill-lock.json`, and `skills/`
- the CLI that applies that config: `agh`

Goal: keep instructions, skills, and shell wiring in one repo instead of hand-copying them into each tool or project.

## Choose Your Path

Use this repo for one of three jobs:

- new machine setup: install `agh`, add it to `PATH`, and link tool instruction files
- project setup: copy the right local skills into a target repo
- catalog maintenance: add or remove skills from the central manifest in this repo

If you only need project skills, skip straight to [Project Setup](#project-setup).

## Prerequisites

- Node.js and `npm`
- `zsh`
- this repo cloned locally

`agh install` manages a `PATH` block in `~/.zshrc` and `~/.zprofile`.

## What This Repo Manages

```text
AGENTS.MD                 Canonical shared instructions
skillfile.toml            Declarative skill manifest
skill-lock.json           Resolved install lockfile for this repo
skills/global/            Shared skills for all projects
skills/ios/               Local iOS skills
skills/android/           Local Android skills
skills/web/               Local web skills
scripts/agh               Agentic Config Helper CLI
docs/agh.md               Detailed CLI reference
docs/skill-catalog.md     Manifest format and validation rules
```

Note: the source file in this repo is `AGENTS.MD`. Target tools may expect different filenames such as `AGENTS.md` or `CLAUDE.md`; `agh` handles that mapping.

## Quick Start

### Machine Bootstrap

Clone the repo and install dependencies:

```bash
git clone https://github.com/<your-account>/agentic-config.git
cd agentic-config
npm install
```

Install `agh` and configure tool instruction symlinks:

```bash
./scripts/agh install
```

This does two things:

- adds this repo's `scripts/` directory to `PATH`
- replaces selected tool instruction files with symlinks to this repo's `AGENTS.MD`

Supported tool targets:

- Codex: `~/.codex/AGENTS.md`
- Claude: `~/.claude/CLAUDE.md`
- OpenCode: `~/.config/opencode/AGENTS.md`

After `install`, open a new shell so `agh` is on `PATH`.

Optional: apply global shared skills:

```bash
agh set-skills --scope global
```

That links `skills/global/` into:

```text
~/.agents/skills/custom
```

At the moment, this repo's manifest contains only `local` skills, so `--scope global` is only useful once you add shared skills under `skills/global/`.

### Project Setup

Run local skill setup from the target project directory, not from this repo.

Example: iOS project

```bash
cd ~/Repos/my-ios-app
agh set-skills --scope local --platforms ios
```

Example: Android project plus any global skills

```bash
cd ~/Repos/my-android-app
agh set-skills --scope both --platforms android
```

This copies the selected local skills into `.agents/skills/` and writes `skills-lock.json` in the project root. `agh` uses that lock to skip unchanged local skills and only recopy when the skill directory is missing or the resolved commit changed.

### Catalog Maintenance

Use `agh add` and `agh remove` when you want to change the canonical catalog in this repo.

Important boundary:

- `agh set-skills` applies existing catalog entries to the current machine or project
- `agh add` and `agh remove` mutate `skillfile.toml`, `skill-lock.json`, and the managed `skills/` tree in `agentic-config`

Those commands can be run from another project directory, but they still modify this repo because `agh` resolves its source-of-truth repo from the installed script location.

Example: add a new Android skill to the central catalog and copy it into the current project

```bash
cd ~/Repos/my-android-app
agh add https://github.com/android/skills \
  --skill navigation-3 \
  --version v0.0.5 \
  --scope local \
  --platform android \
  --source-path navigation/navigation-3
```

## Mental Model

There are two layers:

- source of truth in this repo: `AGENTS.MD`, `skillfile.toml`, `skill-lock.json`, `skills/`
- applied config on a machine or in a project: symlinks, copied skills, and per-project `skills-lock.json`

`agh` always reads from this repo, then applies the result to one of two destinations:

- machine-level config, such as `~/.codex/AGENTS.md` or `~/.agents/skills/custom`
- project-level config, such as `<project>/.agents/skills/` and `<project>/skills-lock.json`

That separation keeps the catalog centralized without forcing every skill into every project.

## When To Re-Run Commands

Use `agh set-config` when:

- a managed instruction symlink is missing or broken
- you want to add or change configured tool targets
- you moved this repo and need the symlinks updated

Use `agh set-skills` when:

- `skillfile.toml` changed
- managed skills in this repo changed after a pull
- you want to refresh a project's local `.agents/skills/`

Normal edits to `AGENTS.MD` do not require `agh set-config` because the tool files are symlinks to this repo copy.

## Verify

Check instruction links:

```bash
ls -l ~/.codex/AGENTS.md ~/.claude/CLAUDE.md ~/.config/opencode/AGENTS.md
```

Check the global skills link:

```bash
ls -l ~/.agents/skills/custom
```

Check local project skills:

```bash
find .agents/skills -maxdepth 2 -name SKILL.md
```

Check the local project lock:

```bash
cat skills-lock.json
```

## Docs

- CLI reference: [docs/agh.md](docs/agh.md)
- Skill manifest and validation rules: [docs/skill-catalog.md](docs/skill-catalog.md)

## Development

Run the `agh` test suite:

```bash
node --test scripts/agh-lib/test/*.test.mjs
```
