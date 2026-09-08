# ccw-advanced-claude-code-lab

Three small money-movement services: `payments`, `kyc`, `ledger`. TypeScript on Node 20+, npm
workspaces, no build step (`tsx` runs sources directly).

## Commands

```bash
npm install                 # once, at the root
npm test                    # all services
npm test -w kyc             # one service (also: npm run test:kyc)
npm run dev:payments        # start one service
npm run test:stable         # excludes the intentionally flaky SLA test
npm run tokens               # token ledger table
npm run statusline           # render the status line once, standalone
npm run scorecard            # append/print the workshop scorecard
npm run evals                # grade the checklist skill (spends tokens)
npm run check                # repo self-check, no tokens spent
npm run grade                # ladder B: hidden tests under grading/ + scope check, prints n/4
npm run issues:reset         # ladder B: restore payments/, kyc/, ledger/ to the committed state
```

## Services

| Folder      | Purpose                              | Dev port |
|-------------|--------------------------------------|----------|
| `payments/` | Payout creation and lookup           | 4001     |
| `kyc/`      | Applicant verification rules         | 4002     |
| `ledger/`   | Accounts, balances, transfers        | 4003     |

Each service owns its `src/`, `tests/` (Vitest), and `package.json` dependencies. Nothing is
shared between services on purpose: one agent can own one service.

`issues/` holds one planted issue per service (ladder B of the workshop); `grading/` holds the
hidden tests that grade a fix — a separate Vitest config that `npm test` never runs. Neither
folder is edited by a rung.

## Coding conventions

- Tests live in `<service>/tests` (Vitest); sources run directly via `tsx`, no build step.
- Keep services independent — don't reach across `payments/`, `kyc/`, and `ledger/` from one another's source.
- Editing a route, an amount, or a transfer under `payments/`, `kyc/`, or `ledger/` auto-triggers
  the `money-movement-conventions` skill (`.claude/skills/money-movement-conventions/SKILL.md`) —
  read it there instead of restating its rules here.

## Rules for delegated work

- Sub-agents return **paths and counts, never transcripts**. State the return shape in every brief (`file:line`, one line each).
- Name the thing to find, not the topic. "Every call site of `verifyToken`", not "look at auth".
- One service per worker. Parallel writers use `isolation: worktree` — except when a worker
  must run `npm test -w <service>`: a worktree has no `node_modules` (the workspace install
  lives at the root), so those writers edit the main tree, one disjoint service folder each.
- Read-only agents get `Read, Grep, Glob` only.
- Ask for a diff summary, not a merge. The human is the gate.

## Cost guards

- `workflowSizeGuideline` is `small` in `.claude/settings.json`. Keep it there during the workshop.
- Every fan-out prompt carries `--max-budget-usd` (headless) or a turn cap (interactive). Calibrate on one service before widening.
- Workers inherit the session model unless the brief routes them. Check the ledger.

## Workshop instruments

This repo doubles as the reference repo for a workshop — see `WORKSHOP.md` for the full guide.
Three hooks are pre-wired in `.claude/settings.json` and run on every matching tool call;
respect them rather than working around them:

- `.claude/hooks/trim-test-output.mjs` (`PreToolUse`/`Bash`) — rewrites a test-running command
  to add Vitest's dot reporter, so a passing or failing run shows only failures and the summary,
  not the full spec output.
- `.claude/hooks/edit-guard.mjs` (`PreToolUse`/`Edit|Write|MultiEdit`) — if `.claude/edit-scope`
  exists (one path prefix per line, created ad hoc for a scoped step), denies any edit outside
  those paths; with no scope file present, it's a no-op.
- `tools/ledger/hook.mjs` (`SubagentStop`/`Stop`) — appends one JSON line per finished sub-agent
  or turn to `runs/token-ledger.jsonl`, priced per model from `tools/ledger/prices.json`.

A status line is wired alongside them (`tools/statusline/statusline.mjs`), reading the live
transcripts rather than the ledger so it also counts sub-agents that are still running:

```
Opus 5  context 111.4k/1M 11% █░░░░░░░░░
session  input 156  cache-write 69.7k  cache-read 6.74M  output 15.4k  cost $1.68
agents 14 (verifier x6 Explore x4 general-purpose x4)  input 60  cache-write 185.1k  cache-read 459.3k  output 2.2k  cost $0.577  total $2.25
```

`input`/`cache-write`/`cache-read`/`output` are the four billing counters kept separate on
purpose — fresh input, cache write (1.25x input), cache read (0.1x input), output — and are the
same four `npm run tokens` prints as `in`/`cache w`/`cache r`/`out`. `context` is not one of
them and is not a total: it's the current window occupancy, taken from the last message alone.
`total` is the session's cost plus every sub-agent's. Window sizes live in
`tools/statusline/context-windows.json` (1M unless a model matches a smaller entry) — edit that
file as models change, not the script.

`runs/` is generated by these hooks and the workshop tools — never edit it by hand.
