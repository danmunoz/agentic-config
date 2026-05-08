---
name: todo
description: "Quickly manage todo items."
---

# Todo JSON Manager

Use this skill to capture and manage backlog items.

## Default Interpretation

- If the user invokes `$todo` or `/todo` followed by free-form text, treat that text as a new pending todo item to record.
- Do not execute the described task.
- Do not open, modify, or operate on other repos, files, services, or systems mentioned in the todo text.
- The skill's job is only backlog management: add, list, edit, complete, delete.

Example:

- `$todo I just added the committer script to PATH and need to sync this with the .dotfiles repo`
- Meaning: create a pending todo item describing that follow-up work.
- Not allowed: actually updating `.dotfiles`.

## Rules

- Run the CLI at `~/Repos/todo/bin/todo`.
- Do not hand-edit `~/Repos/todo/data/pending.json` or `~/Repos/todo/data/archive.json` for normal add/edit/delete/complete work.
- Keep `schema_version` unchanged unless the user explicitly requests a schema change.
- If the user gives unstructured text, default to `add`.
- Only perform the CLI operation needed to manage the backlog item itself.

## Commands

Run from repo root:

```bash
python3 bin/todo list
python3 bin/todo list --archive
python3 bin/todo add --title "..." --details "..."
python3 bin/todo edit <id> --title "..."
python3 bin/todo edit <id> --details "..."
python3 bin/todo edit <id> --clear-details
python3 bin/todo complete <id>
python3 bin/todo delete <id>
python3 bin/todo delete <id> --archive
```

## Response Contract

- After mutations, report the affected item id.
- Mention whether the item changed `pending.json` or `archive.json`.
- If the user input was free-form capture text, briefly confirm it was recorded as a todo item.
