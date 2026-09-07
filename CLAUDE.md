# ccw-advanced-claude-code-lab

Three small money-movement services used in the Advanced Claude Code workshop. TypeScript on Node 20+, npm workspaces, no build step (`tsx` runs sources directly).

## Services

| Folder      | Purpose                              | Dev port |
|-------------|--------------------------------------|----------|
| `payments/` | Payout creation and lookup           | 4001     |
| `kyc/`      | Applicant verification rules         | 4002     |
| `ledger/`   | Accounts, balances, transfers        | 4003     |

Each service owns its `src/`, `tests/` (Vitest), and `package.json` dependencies. Nothing is shared between services on purpose: one agent can own one service.

## Commands

```bash
npm install                 # once, at the root
npm test                    # all services
npm test -w kyc             # one service (also: npm run test:kyc)
npm run dev:payments        # start one service
npm run tokens              # token ledger table
npm run scorecard           # append/print the workshop scorecard
npm run evals               # grade the checklist skill (spends tokens)
npm run check               # repo self-check, no tokens spent
```

## Rules for delegated work

- Sub-agents return **paths and counts, never transcripts**. State the return shape in every brief (`file:line`, one line each).
- Name the thing to find, not the topic. "Every call site of `verifyToken`", not "look at auth".
- One service per worker. Parallel writers use `isolation: worktree`.
- Read-only agents get `Read, Grep, Glob` only.
- Ask for a diff summary, not a merge. The human is the gate.

## Cost guards

- `workflowSizeGuideline` is `small` in `.claude/settings.json`. Keep it there during the workshop.
- Every fan-out prompt carries `--max-budget-usd` (headless) or a turn cap (interactive). Calibrate on one service before widening.
- Workers inherit the session model unless the brief routes them. Check the ledger.

## Token ledger

`SubagentStop` and `Stop` hooks append one JSON line per finished sub-agent or turn to `runs/token-ledger.jsonl` (gitignored). `npm run tokens` prints the table with an estimated cost per model. Do not edit `runs/` by hand.

## Where things live

- `CASE.md` — read this first: the story, the five planted problems, what the scorecard is for.
- `.claude/skills/money-movement-checklist` — Claude invokes it on its own reviewing a diff; shipped deliberately weak on one item.
- `.claude/skills/dep-audit` — you invoke it, `/dep-audit`; orchestrates sub-agents to find and verify unpinned dependencies.
- `.claude/skills/flaky-scan` — you invoke it, `/flaky-scan <service> [runs]`; wraps a deterministic rerun script, no LLM calls.
- `.claude/skills/money-movement-conventions` — Claude invokes it on its own editing `payments/`, `kyc/`, or `ledger/`.
- `.claude/` (agents, hooks, settings) — otherwise pre-wired: a finished verifier agent, hooks, the cost guard.
- `build-it/` — bonus track: stubs (look for `TODO`) with a byte-identical finished counterpart under `.claude/`.
- `solutions/.claude` — finished copies of the `build-it/` stubs and the two always-on skills above, plus `GOAL-FIX.md` and the saved `dep-audit-workflow`.
- `evals/` — the checklist skill's eval kit: five labelled diffs, a deterministic grader, a runner, a compare command.
- `tools/` — the ledger hook and reporter, the structure check, and `scorecard/` for `runs/scorecard.md`.
