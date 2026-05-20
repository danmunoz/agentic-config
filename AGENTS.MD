# AGENTS.md

Owner: Daniel Munoz (`me@danmunoz.com`)
Version: 3
Last updated: 2026-05-20


## Instruction Precedence
- Order: system/tooling policy > repo `AGENTS.md` > direct user request > this file.
- Rule conflict: safer/non-destructive path; ask user.

## Agent Protocol
- Workspace root: `~/Repos`
- Keep files under ~500 LOC when practical; split/refactor
- Coding-task replies: telegraph, minimal filler
- Non-coding writing tasks: normal grammar allowed
- Prefer end-to-end verify; if blocked, state exact blocker
- Need upstream file: stage in `/tmp/`, then cherry-pick; never overwrite tracked.
- Bugs: add regression test when it fits.

## Safety + Consent
- Safe default always
- User-typed command = consent for that command only, this turn only
- Never expose secrets/tokens in output; redact sensitive values
- Unexpected workspace changes: assume other agent; avoid revert/delete; coordinate

## Flow + Runtime
- Use repo's existing package manager/runtime; no swaps without approval
- Long jobs: Codex background
- `tmux`: only interactive/persistent needs (debugger/server)
- zsh: don't use `status` as a variable.

## Git
- Start with: `git status`, `git diff`, `git log`
- Push only when user asks
- Branch changes require user consent
- Prefer HTTPS remotes under `~/Repos`; flip SSH->HTTPS before pull/push when needed
- No destructive ops without explicit written instruction in this thread:
  - `git reset --hard`, `git clean -fd`, `rm -rf`, `git checkout <old>`, `git restore --source`, force-push
- Do not revert/delete/rename unexpected files without user confirmation
- Commit helper on PATH: `committer` (bash).
- Conventional Commits required: `feat|fix|refactor|build|ci|chore|docs|style|perf|test`
- Atomic commits only; include explicit file paths
- Quote paths with brackets/parentheses
- Never amend commit unless explicitly approved
- Always run `git status` again before commit
- Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.

## Docs
- Read only docs/links relevant to current decision
- Keep notes short
- Behavior/API change => update docs in same task
- Add `read_when` hints for cross-cutting docs
- No ship with stale docs

## Language/Stack Notes
- Swift: modern Swift 6 concurrency correctness (`@MainActor`, isolation, `Sendable`)
- TypeScript: use repo PM/scripts; keep files small; follow existing patterns
- Root-cause fixes over band-aids; if uncertain, read more code then ask concise options

## iOS
- Follow latest Apple coding + UI/UX guidance
- Use modern iOS patterns; Liquid Glass principles where suitable

## Tools
- Editor: `code <path>`
- `committer`: Commit helper (PATH). Stages only listed paths; required here.
- `gh`: use for GitHub issues/CI/releases (not web search)
- `tmux`: persistence/interactive only

## Frontend Aesthetics
- Avoid generic "AI slop"
- Typography: real type choice; avoid Inter/Roboto/Arial/system defaults
- Theme: clear palette + CSS vars; bold accents
- Motion: 1–2 meaningful moments; avoid random micro-anim
- Avoid purple-on-white cliches, generic grids, predictable layouts

# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Always prefix shell commands with `rtk`.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```
