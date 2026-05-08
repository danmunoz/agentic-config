# agentic-config

Shared global configuration for agentic coding tools.

## What this repo holds

- Global agent instructions: `AGENTS.MD`
- Global custom skills: `global/skills/`

## Global Agent Setup

Point both Codex and Claude global instruction files at this repo:

```bash
ln -sfn ~/Repos/agentic-config/AGENTS.MD ~/.codex/AGENTS.md
ln -sfn ~/Repos/agentic-config/AGENTS.MD ~/.claude/CLAUDE.md
```

Point global custom skill discovery at this repo:

```bash
mkdir -p ~/.codex/skills ~/.claude/skills
ln -sfn ~/Repos/agentic-config/global/skills ~/.codex/skills/custom
ln -sfn ~/Repos/agentic-config/global/skills ~/.claude/skills/custom
```

## Verify

```bash
ls -l ~/.codex/AGENTS.md ~/.claude/CLAUDE.md
ls -l ~/.codex/skills/custom ~/.claude/skills/custom
```

Expected targets:

- `~/.codex/AGENTS.md -> ~/Repos/agentic-config/AGENTS.MD`
- `~/.claude/CLAUDE.md -> ~/Repos/agentic-config/AGENTS.MD`
- `~/.codex/skills/custom -> ~/Repos/agentic-config/global/skills`
- `~/.claude/skills/custom -> ~/Repos/agentic-config/global/skills`
