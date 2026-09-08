# Workshop guide

## What the workshop is

One Friday afternoon, three small money-movement services, and five problems planted on purpose
— see [CASE.md](CASE.md) for the story. You resolve the **same three issues five different ways**,
from one sub-agent to an agent team (ladder B below), then converge on a real fix with `/goal`,
grade a skill against an evals kit, schedule a routine, and end with one scorecard that says what
every step cost. The dependency audit (ladder A) ships alongside it, and is the ladder the
build-it bonus rebuilds.

## Where the steps and points live

The steps, prompts, and points live in the workshop app, not here. This file maps the repo's
files and commands to those steps, so you can follow along in a terminal alongside the app.

## Ladder A — the dependency audit

**The app's steps 4–9 run ladder B, below.** This read-only audit is the ladder the build-it
bonus (steps 15–16) rebuilds: `/dep-audit` and the verifier agent are its pieces, and they are
the ones that ship with stubs.

Five ways to run the same dependency audit across `payments/`, `kyc/`, and `ledger/`. The full
prompts, byte for byte, and the deliverable contract they all share are in
[solutions/RUNGS.md](solutions/RUNGS.md): every rung writes `runs/dep-audit.md` (confirmed
entries grouped by service, a `## Refuted` section with reasons) and replies with exactly
`found <n>, confirmed <n>, refuted <n>`. Start the session with
`claude --setting-sources project,local` (this repo's settings only). Before each rung: `/clear`
(the ledger and scorecard live on disk and survive it; the conversation's cache reads don't, so
each row measures one harness from the same baseline), then `rm -f runs/dep-audit.md`. After each
rung:

```bash
npm run scorecard -- add "<rung>" --result "<the reply>" --score "<n>/4" --risk "<what could have gone wrong>"
```

The answer key has four entries; two decoys sit next to them (kyc's `engines` range, ledger's
`debug` range pinned by a root `overrides`). Every finder flags at least the `debug` one, so the
rungs stop agreeing the moment nothing re-reads the line before it is merged:

| rung | harness | prompt | expected reply | score | what it teaches |
|---|---|---|---|---|---|
| 1 | one sub-agent, self-verifying | RUNGS.md § Rung 1 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | what one careful sub-agent costs, and where its own verification can still drift |
| 2 | three background finders, no verifier | RUNGS.md § Rung 2 | `found 5–6, confirmed 5–6, refuted 0` (confirmed = found, by construction) | 2/4–3/4 | a merged list is only as good as whoever checks it afterward — here, no one does, and the decoys land in the report |
| 3 | `/dep-audit` skill | RUNGS.md § Rung 3 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | what a finished find/verify/report skill buys over ad hoc prompting — a Refuted section with reasons |
| 4 | dynamic workflow, saved as `/dep-audit-workflow` | RUNGS.md § Rung 4 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | the same shape as rung 3, built and saved by you |
| 5 | agent team (interactive) | RUNGS.md § Rung 5 | `found 5–6, confirmed 4, refuted 1–2`, or `not run` | 4/4 | a consensus is only as good as its verifier teammate — if it rubber-stamps, you bought rung 2 at four sessions' price |

`found` varies by one because kyc's `engines` decoy is only flagged by finders that read past
`dependencies`/`devDependencies`; ledger's `debug` decoy is flagged by every finder. Grade the
confirmed entries against the key, not the `found` count.

## Ladder B — the workshop's ladder: the same five harnesses on a write task

**This is what the app's steps 4–9 run.** Ladder A audits three tiny manifests, and in the
measured run four of five rungs scored 4/4 — the task is too small for the harness to matter.
Ladder B runs the same five harnesses on a task that edits code: three issues under `issues/`,
one per service, each with numbered acceptance criteria. The three defects are already in the
shipped source — no planting step. Prompts, byte for byte, and the deliverable contract are
in [solutions/RUNGS-ISSUES.md](solutions/RUNGS-ISSUES.md);
the answer key and the bad fixes that still pass the visible tests are in
[solutions/ISSUE-FIXES.md](solutions/ISSUE-FIXES.md).

| issue | service | what is wrong | the fix that goes green and is still wrong |
|---|---|---|---|
| A | `payments/` | a retried `POST /payouts` creates a second payout | dedupe by body instead of by key |
| B | `kyc/` | `GET /applicants/:id/status` needs no token | copy the `kyc:write` scope from the verify route |
| C | `ledger/` | a reused `idempotencyKey` with a different body returns the first entry | key the map by `key + amount` — money moves twice |

The grader is `npm run grade`: it runs the hidden tests under `grading/` (a separate Vitest
config, never part of `npm test`), checks that nothing outside the three services changed and no
test was deleted or skipped, prints one line per issue with the missed criteria by name, and
prints the scorecard command to paste. Score is `<n>/4`: one point per issue, one for scope.

Per rung: `/clear` → `npm run issues:reset` (restores `payments/`, `kyc/`, `ledger/` to the
committed state; nothing else is touched) → the prompt → `npm run grade` → the scorecard row.
Every rung replies `fixed <n>, holds <n>, fails <n>` — its own claim — and the grade is the
truth; the gap between the two is the "what could have gone wrong" column.

| rung | harness | prompt | expected reply | expected grade | what it teaches |
|---|---|---|---|---|---|
| 1 | one sub-agent, self-verifying | RUNGS-ISSUES.md § Rung 1 | `fixed 3, holds 3, fails 0` | 3/4–4/4 | one careful agent gets most of it; its own check tends to re-run the tests it just wrote |
| 2 | three background writers, no verifier | RUNGS-ISSUES.md § Rung 2 | `fixed 3, holds 3, fails 0` (by construction) | 2/4–3/4 | the claim is always 3/3; the grade shows which writer stopped at the first criterion that went green |
| 3 | `/issue-fix` skill | RUNGS-ISSUES.md § Rung 3 | `fixed 3, holds <n>, fails <n>` | 4/4 | a verifier that derives checks from the issue text, not the diff, catches the composite key, the write scope, the amount-only compare |
| 4 | dynamic workflow, saved as `/issue-fix-workflow` | RUNGS-ISSUES.md § Rung 4 | same as 3 | 4/4 | the same plan as a script: phases, schemas, per-agent cost, rerunnable with args |
| 5 | agent team (interactive) | RUNGS-ISSUES.md § Rung 5 | same as 3, or `not run` | 4/4 if the verifier holds | a consensus is only as good as its verifier teammate |

New pieces for this ladder: `.claude/agents/fix-verifier.md` (one per issue; writes a throwaway
check script under `runs/verify/` from the acceptance criteria and runs it — do not create
`.claude/edit-scope` during this ladder or it will block those writes), `.claude/skills/issue-fix`
(rung 3), `solutions/.claude/workflows/issue-fix-workflow.js` (rung 4's saved script), and
`tools/grade/grade.mjs`. Parallel writers edit the main tree, one service each, rather than
worktrees: a worktree has no `node_modules`, so `npm test -w <service>` cannot run there.

## The instruments

- **Token ledger** — `SubagentStop`/`Stop` hooks append one line per finished sub-agent or turn
  to `runs/token-ledger.jsonl`; `npm run tokens` prints a table priced per model from
  `tools/ledger/prices.json`. `tools/ledger/dedupe.mjs` is a one-off repair tool that
  re-verifies each row against its own transcript on disk — only needed against a ledger file
  written by an older hook version, not a routine step.
- **Status line** — `tools/statusline/statusline.mjs`, wired via `statusLine` in
  `.claude/settings.json`. The live counterpart to the ledger: it parses the session and
  sub-agent transcripts directly, so it counts agents that are still running, and it keeps
  `input`/`cache-write`/`cache-read`/`output` separate instead of summing them into one "tokens" figure. `context` is the
  current window occupancy (last message only), not a running total, measured against
  `tools/statusline/context-windows.json` — 1M by default, edit that file as models change.
  `npm run statusline` renders it once for testing.
- **Scorecard** — `npm run scorecard -- add "<step>" --result "<what came back>" --score "<n/4>"
  --risk "<what could have gone wrong>"` appends one row; `npm run scorecard` prints the table:
  step, what came back, `correct` (out of 4: confirmed findings in the key, minus confirmed
  entries that aren't — a merged decoy costs a point), agents, tokens, est $, wall, and the risk
  column.
- **Evals kit** (`evals/`) — grades the `money-movement-checklist` skill headless against five
  labelled diffs: `npm run evals`, `npm run evals:compare`.
- **flaky-scan** (`.claude/skills/flaky-scan`) — `/flaky-scan <service> [runs]` reruns a
  service's tests N times and reports which tests failed in some runs but not all; no LLM calls.
- **Four kinds of skill** — see the table in [CASE.md](CASE.md).
- **The verifier agent** (`.claude/agents/verifier.md`) — one sub-agent per finding, tries to
  refute it by re-reading the cited line; used by `/dep-audit` (rung 3) and the saved workflow
  (rung 4).
- **The saved workflow** (`solutions/.claude/workflows/dep-audit-workflow.js`) — rung 4's
  Find/Verify/Report script, saved under a name distinct from the rung-3 skill's `/dep-audit`.

## Build-it bonus track

Copy a stub over its finished counterpart under `.claude/`, fill in the TODOs, rerun the step,
and compare against the finished version — see [build-it/README.md](build-it/README.md) for the
how, and [solutions/README.md](solutions/README.md) for the full list of what's already finished
there (the verifier agent, the dep-audit skill, the strong checklist skill, the saved workflow,
and `GOAL-FIX.md`'s rubric).

## Attendee prerequisites and gotchas

- Claude Code 2.1.251 or newer (`claude update`).
- Start it with `claude --setting-sources project,local` so user-level plugins, MCP servers and
  skills stay out of the context window and the token ledger.
- A plan with workflows enabled — rung 4's dynamic workflow needs it.
- Node 20+.
- `gh` authenticated — the routine step opens GitHub issues.
- Fork the repo: a scheduled routine needs to own the repo it runs against, and Issues must be
  enabled on your fork for the routine step to open them.
- On Windows, use Git Bash, not PowerShell — a PowerShell-piped command adds a byte-order mark
  that broke the token ledger hook in testing.
- Agent teams (rung 5) need `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` exported before starting
  `claude`. If your setup doesn't support it, write `not run` in the scorecard and keep going.

## Cost

The measured **ladder A** run — rungs 1 through 4, plus evals and the hook/structure check —
cost **$1.21** on Sonnet. **Ladder B costs more**: each writer runs its service's tests, so budget
well under **$5** for the whole lab. Both are estimates — read your own `npm run tokens` rather
than take either on faith. Every fan-out prompt in the workshop carries a cost guard: a turn cap
when interactive, `--max-budget-usd` when headless (see `CLAUDE.md`'s Cost guards).

## Step map

Maps each of the 17 workshop steps to what you actually touch or run in this repo. No answer
key here — see [solutions/PLANTED-FINDINGS.md](solutions/PLANTED-FINDINGS.md) for the exact
files, lines, and expected diffs, if you're stuck or authoring workshop text.

| # | step | repo artifacts |
|---|---|---|
| 1 | The case | `CASE.md`, `npm install`, `npm test`, `npm run grade` (the 1/4 floor) |
| 2 | Size it (skippable) | `/context`, `/usage`, `.claude/hooks/trim-test-output.mjs` |
| 3 | A skill you never call | `ledger/`, `.claude/skills/money-movement-conventions`, `npm run issues:reset` |
| 4 | Rung 1 | one self-verifying sub-agent, `issues/`, `runs/issue-fix.md`, `npm run grade` |
| 5 | Read the meter | `npm run tokens` |
| 6 | Rung 2 | three background writers, one per service, `runs/issue-fix.md`, `npm run grade` |
| 7 | Rung 3 | `/issue-fix`, `.claude/skills/issue-fix`, `.claude/agents/fix-verifier.md` |
| 8 | Rung 4 | an ultracode workflow, saved as `/issue-fix-workflow` |
| 9 | Rung 5 | an agent team, interactive, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| 10 | Compare the rungs | `npm run scorecard` |
| 11 | `/goal` on kyc | `/flaky-scan kyc`, `.claude/edit-scope`, `/goal`, `kyc/`, `solutions/GOAL-FIX.md` |
| 12 | Grade the checklist skill | `npm run evals`, `.claude/skills/money-movement-checklist` |
| 13 | Create one routine | `/flaky-scan kyc 3`, a scheduled routine, GitHub issues |
| 14 | Bring the scorecard | `runs/scorecard.md` |
| 15 | Bonus — build it: the verifier | `build-it/verifier.stub.md` → `.claude/agents/verifier.md` |
| 16 | Bonus — build it: the dep-audit skill | `build-it/dep-audit.SKILL.stub.md` → `.claude/skills/dep-audit/SKILL.md` |
| 17 | Bonus — build it: wire the trimmer hook | `.claude/settings.json`, `.claude/hooks/trim-test-output.mjs` |
