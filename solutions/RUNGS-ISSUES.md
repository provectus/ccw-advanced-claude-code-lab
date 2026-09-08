# Ladder B — one task, five harnesses, on a write task

Five ways to run the same job: resolve the three issues under `issues/` — one per service —
and leave the tree in a state the hidden tests accept. Same task, same grader, every time —
what changes is the harness. Ladder A (`RUNGS.md`) audits; this ladder edits.

## The deliverable contract

- **Task**: resolve `issues/payments-duplicate-payouts.md` (A), `issues/kyc-status-leak.md`
  (B), `issues/ledger-idempotency-conflict.md` (C). Each issue carries numbered acceptance
  criteria; the hidden tests under `grading/` are those criteria, written down.
- **Every rung edits only** `payments/`, `kyc/`, `ledger/`. Nothing else is in scope, and the
  grader deducts a point for anything outside.
- **Every rung writes** `runs/issue-fix.md`: one section per service with a verdict line
  (`holds` or `fails` and a one-line reason) and the diff summary (`<file>:<line> — <what
  changed>`, one line each). Then it replies with exactly:
  `fixed <n>, holds <n>, fails <n>`.
- **Score**: what `npm run grade` prints — `<n>/4`, one point per issue whose hidden tests all
  pass, one for a clean scope. The reply line is the harness's *claim*; the grade is the truth.
  Write the gap between them in the scorecard's "what could have gone wrong" column.
- **Scorecard row**: paste the command `npm run grade` prints, filling in the rung and reply:
  `npm run scorecard -- add "<rung>" --result "fixed <n>, holds <n>, fails <n>" --score "<n>/4" --risk "<the criterion that failed, or what the verifier never checked>"`.

Start the session with `claude --setting-sources project,local`, as for ladder A.

Before each rung: `/clear`, then `npm run issues:reset` (restores the three service folders to
the committed state — `git checkout` plus `git clean` on those folders only — so every rung
starts from the same planted tree). After each rung: `npm run grade`, then the scorecard row.
Do not create `.claude/edit-scope` during this ladder: the fix-verifier writes its throwaway
scripts under `runs/verify/`, which a scope file would block.

Parallel writers edit the main tree, one service each, instead of worktrees: a git worktree has
no `node_modules` (the workspace install lives at the root), so `npm test -w <service>` cannot
run there. Three writers on three disjoint folders cannot collide, which is the property the
worktree rule exists to protect.

## Rung 1 — one sub-agent, self-verifying

Runs in any Claude Code session (interactive or `-p`).

```
Spawn one general-purpose subagent to resolve the three issues under issues/ (one per
service: payments, kyc, ledger), in turn. For each: read the issue, edit only that
service's folder, meet every numbered acceptance criterion including the tests it asks
for, run npm test -w <service>, then check each criterion yourself against the running
code before moving on. Write runs/issue-fix.md (one section per service: verdict line,
diff summary as <file>:<line> — <what changed>) and reply exactly:
fixed <n>, holds <n>, fails <n>. Stop after 25 turns.
```

## Rung 2 — three parallel writers, no verifier

Runs in any Claude Code session (interactive or `-p`).

```
Run three subagents in background, one per issue under issues/ (payments, kyc, ledger).
Each: read its issue, edit only its own service folder, meet every numbered acceptance
criterion including the tests it asks for, run npm test -w <service>, and return a diff
summary only (<file>:<line> — <what changed>, one line each). No verification. When all
three return, write runs/issue-fix.md from the summaries (verdict: holds for every
service that returned one) and reply exactly: fixed <n>, holds <n>, fails <n>
(holds = fixed, fails 0). Stop after 15 turns.
```

## Rung 3 — the skill

Runs in any Claude Code session (interactive or `-p`).

```
/issue-fix payments kyc ledger
```

Calibrate first on one service: `/issue-fix ledger` should reply `fixed 1, holds 1, fails 0`
and `npm run grade` should show C passing, A and B still failing.

## Rung 4 — the dynamic workflow

Runs in any Claude Code session (the ultracode workflow runs in `-p` too).

```
ultracode: resolve the three issues under issues/ — one writer per service (payments,
kyc, ledger), each editing only its own folder and running npm test -w <service>; then
verify each fix with the fix-verifier agent against the issue's acceptance criteria; write
runs/issue-fix.md (verdict per service, diff summary) and reply exactly:
fixed <n>, holds <n>, fails <n>. Keep it small.
```

Save it as `/issue-fix-workflow` when prompted — a distinct name from the rung-3 skill's
`/issue-fix`. The saved script should match `solutions/.claude/workflows/issue-fix-workflow.js`
in shape: Fix (parallel) → Verify (pipeline) → Report.

## Rung 5 — the agent team

Interactive only. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` before starting `claude`. If
your setup doesn't support agent teams, write `not run` in the scorecard and move on.

```
Spawn a team: three fixer teammates (payments, kyc, ledger), each resolving its service's
issue under issues/ in its own folder only and running npm test -w <service>, and one
verifier teammate that tries to break every fix by deriving a check from each numbered
acceptance criterion in the issue and running it against the code — not by reading the
diff. Write runs/issue-fix.md (verdict per service, diff summary) and reply exactly:
fixed <n>, holds <n>, fails <n>. Cap each teammate at 15 turns; stop when the report is
written.
```

## Expected shapes

| rung | expected reply | expected grade | what it teaches |
|---|---|---|---|
| 1 | `fixed 3, holds 3, fails 0` | 3/4–4/4 | one careful agent gets most of it; its own "check" tends to re-run the tests it just wrote |
| 2 | `fixed 3, holds 3, fails 0` (by construction) | 2/4–3/4 | the claim is always 3/3; the grade shows which writer stopped at the first criterion that went green |
| 3 | `fixed 3, holds <n>, fails <n>` | 4/4 when the verifier holds | a verifier that derives checks from the issue text catches the composite key, the write scope, the amount-only compare |
| 4 | same as 3 | 4/4 | the same plan as a script: phases, schemas, per-agent cost, rerunnable with args |
| 5 | same as 3, or `not run` | 4/4 if the verifier teammate holds | a consensus is only as good as its verifier; if it reads the diff and agrees, you bought rung 2 at four sessions' price |

Failure shapes worth recognising: a rung whose reply says `holds 3` while `npm run grade` says
`2/4` (the verifier rubber-stamped); a writer that edits the visible test to send a token but
adds no `401` test (criterion 5 of B, not graded, worth the risk column); a ledger fix that goes
green by keying the map on `key + amount` (`C3` fails — money moved twice).
