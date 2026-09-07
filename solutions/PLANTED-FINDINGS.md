# Planted findings — answer key

Spoils every step. Read only if you're stuck or writing the workshop text. Line numbers below were
read from the files in this repo, not reconstructed from the spec.

## 1. Unpinned dependencies (all three manifests) — rungs 3 and 4

- `payments/package.json:12` — `"axios": "latest"`
- `payments/package.json:14` — `"lodash": "*"`
- `kyc/package.json:12` — `"dayjs": ">=1.11"`
- `ledger/package.json:13` — `"uuid": "*"`

`express` is pinned exact (`5.2.1`) in all three and is not a finding. None of the four are pinned
by an override in `package-lock.json` (checked: no `overrides` block; the lockfile just repeats the
loose range), so all four are genuinely **confirmed**, not refutable.

Consumed by: the `dep-audit` skill (rung 3) and the saved dynamic workflow (rung 4).
Expected result of either: **found 4, confirmed 4, refuted 0** — one dependency in `kyc` and
`ledger` each, two in `payments`. If a run ever does produce a refuted finding, it shows up
under a "Refuted" heading in `runs/dep-audit.md` with the verifier's one-line reason, rather
than disappearing from the report.

## 2. Ledger transfer route missing auth middleware — checklist skill, evals

- `ledger/src/app.ts:35` — `app.post('/transfer', (req, res, next) => {` has no `requireAuth(...)`
  argument, unlike the sibling routes at `ledger/src/app.ts:13`, `:22`, `:31`, which all pass
  `requireAuth('ledger:write' | 'ledger:read')`.

Consumed by: the `money-movement-checklist` skill (checklist item 1, "Auth on money-moving
routes") and the evals kit, which grades whether the skill catches it in a diff that touches this
route. Also the mirror image of it: the "A skill you never call" step asks Claude to add a new
`POST /refund` route to this same file, and the (auto-triggered) `money-movement-conventions`
skill is what's expected to make Claude give the new route the `requireAuth('ledger:write')` that
`/transfer` is missing.
Expected result: the skill's output includes a line shaped like
`critical ledger/src/app.ts:35 — Auth on money-moving routes — /transfer moves funds with no verifyToken/requireAuth check.`

## 3. Timing-dependent flaky test in kyc — `/goal`, routine

- `kyc/src/verification.ts:47-49` — `providerLatencyMs()` returns `5 + Math.floor(Math.random() * 40)`
  (5-44ms), a non-deterministic "provider round trip" simulation.
- `kyc/src/verification.ts:53` — `runChecks` awaits that latency before computing `elapsedMs`.
- `kyc/tests/sla.test.ts:10` — asserts `result.elapsedMs).toBeLessThanOrEqual(25)`, which the
  ~47% of runs where the random latency lands above 25ms will fail.

The test is intentionally excluded from `npm test:stable` / `check` (see `package.json`'s
`test:stable` script) so it only surfaces when run directly or via `/goal`.

**Correct fix**: `kyc/src/verification.ts` — make the provider latency injectable/deterministic
(e.g. accept an optional delay function or fixed value that `runChecks` uses instead of always
calling `providerLatencyMs()`, defaulting to today's random behavior in production use). The fix
is **not** editing `kyc/tests/sla.test.ts` — raising or removing the threshold, or deleting the
assertion, defeats the point of the step and should read as a miss if an attendee does it.

Consumed by: the `/goal` step (which opens with `/flaky-scan kyc 4` to prove the flake exists,
then converges on a deterministic fix in `kyc/src/verification.ts`; stated check calls
`npm test -w kyc`; turn cap; the edit-guard hook restricts edits to `kyc/`) and the routine step
(`/flaky-scan kyc 3` as the scheduled prompt body, opening one issue per flaky test found).

## 4. Hardcoded API key in payments config — evals grader

- `payments/src/config.ts:4` — `providerApiKey: 'sk_live_51HqX9pKm3TzRw8u-E2vNbC7yLd4Af0gJiPo6sVqWxZ1'`,
  a live-looking secret as a string literal instead of read from `process.env`.

Consumed by: the evals kit's grader (checklist item 2, "Secrets in source") — one of the five
labelled diffs is expected to include or touch this line so the grader can assert the skill
flags it and does not pass a diff that carries it uncriticized.
Expected result: the skill's output includes a line shaped like
`critical payments/src/config.ts:4 — Secrets in source — sk_live_ credential is a string literal, not read from the environment.`

## 5. Token-verification call sites across services — rung 1 prompt

The spec text says "three token-verification call sites across services"; the real count in this
repo is **six** call expressions (not counting the three `export function verifyToken` definitions
or the two `import { verifyToken }` statements). Use the real count — it's what an Explore
sub-agent will actually return, and what the workshop step should show as "success looks like".

- `payments/src/app.ts:17` — inside `POST /payouts`
- `payments/src/app.ts:33` — inside `GET /payouts/summary`
- `payments/src/app.ts:49` — inside `GET /payouts/:id`
- `payments/src/app.ts:64` — inside `GET /accounts/:accountId/payouts`
- `kyc/src/app.ts:17` — inside `POST /applicants/:id/verify`
- `ledger/src/auth.ts:38` — inside the `requireAuth(scope)` middleware factory (ledger's routes
  call `requireAuth(...)`, which calls `verifyToken` once per request; there is no direct
  `verifyToken(...)` call written in `ledger/src/app.ts`)

Consumed by: rung 1, the scoped read-only Explore sub-agent ("every call site of `verifyToken`,
not `look at auth`").
Expected result of the prompt: the sub-agent returns exactly six `file:line` lines, one per call
site above, and nothing else (no transcript, no file contents).

# Expected outputs by step

1. **The case** — fork, clone, `npm install` succeeds, `npm test` runs (one test is flaky on
   purpose — the SLA test, finding 3), and the attendee has read `CASE.md`.
2. **Size it** (skippable) — attendee states model/effort and reads `/context` and `/usage`; the
   `trim-test-output` hook is pre-wired, so a failing `npm test` already shows failures only —
   the attendee confirms it fires rather than wiring it (wiring it by hand is bonus step 16).
3. **A skill you never call** — Claude adds `POST /refund` to `ledger/src/app.ts` (reverses a
   transfer by entry id); the attendee never mentions or invokes any skill. The
   `money-movement-conventions` skill (`.claude/skills/money-movement-conventions/SKILL.md`)
   auto-triggers because the edit is under `ledger/`. Expected diff: `requireAuth('ledger:write')`
   on the new route, an `idempotencyKey` accepted and used, a positive-integer amount check
   before anything moves, and one new test for the 401 case. If the skill doesn't fire (the diff
   is missing one of those), the fix is to tighten the skill's description, not to prompt around it.
4. **Rung 1 — scoped Explore sub-agent** — one sub-agent, read-only, briefed for "every call
   site of `verifyToken`, not `look at auth`"; returns the six `file:line` lines from finding 5
   above, nothing else. `npm run scorecard -- add "Rung 1" --result ...` records the row.
5. **Read the meter (ledger)** — `npm run tokens` after step 4 shows one row for the sub-agent
   with its own token counts, model, and estimated cost, distinct from the main session's row.
6. **Rung 2 — three workers in three worktrees** — one worker per service
   (`payments`/`kyc`/`ledger`), each `isolation: worktree`, each returns a short diff summary;
   three worktrees exist and don't collide on files. A scorecard row is added, then the
   worktrees are discarded (`git worktree remove`, branches deleted).
7. **Rung 3 — run the finished `/dep-audit`** — attendee reads the ten lines of the skill that
   matter (the three steps) before running it; `/dep-audit` (or `/dep-audit payments kyc ledger`)
   produces `runs/dep-audit.md` and replies with **found 4, confirmed 4, refuted 0** (finding 1).
   A scorecard row is added.
8. **Rung 4 — dynamic workflow** — a scoped workflow run over one service (e.g. `payments`)
   shows Find/Verify/Report phases live with per-agent tokens, and saving it (as
   `/dep-audit-workflow` — a distinct name from the rung-3 skill's `/dep-audit`) produces a
   script equivalent to `solutions/.claude/workflows/dep-audit-workflow.js`; run against all
   three services it reproduces step 7's found/confirmed/refuted counts. A scorecard row is added.
9. **Compare the rungs** — `npm run scorecard` prints all four rows; the attendee fills in the
   "what could have gone wrong" column for each (a worker that drifted off-brief in rung 2, a
   checklist confidently wrong about one item in rung 7/11, and so on).
10. **`/goal` on kyc** — the attendee opens with `/flaky-scan kyc 4` to show the SLA test failing
    some (or all) of 4 runs, proving the flake before touching any code. Then a goal against
    `kyc/tests/sla.test.ts` with a stated check (`npm test -w kyc` passes) and a turn cap
    converges on the fix in `kyc/src/verification.ts` (finding 3), with the edit-guard hook
    restricting edits to `kyc/`; the attendee grades Claude's diff against `GOAL-FIX.md`'s
    rubric — editing the test is a failed attempt, not success, and a busy-wait/polling fix that
    hides the randomness rather than fixing it should also read as a miss.
11. **Evals** — `npm run evals` runs the shipped `money-movement-checklist` skill headless
    against the five labelled diffs: baseline is **4/5**, missing task-03 (checklist item 3 is
    shipped weak), with the missed pattern printed inline; the attendee strengthens item 3 to
    match `solutions/.claude/skills/money-movement-checklist/SKILL.md` and reruns to **5/5**,
    reporting the pass-rate and cost delta.
12. **Routine** — a scheduled routine's prompt body is: "Run `/flaky-scan kyc 3`. For each flaky
    test open one GitHub issue titled `flaky: <test name>` with the line the skill printed. If it
    prints no flaky tests, do nothing. Stop after 15 turns." No countdown, no interactive prompt —
    it either opens zero issues (clean run) or one issue per flaky test.
13. **Bring the scorecard** — attendee has one table, `runs/scorecard.md`, with a row per rung
    plus `/goal` and evals, each with agents/tokens/est $/wall and the risk column filled in.
14. **Bonus — build it: the verifier** — copy `build-it/verifier.stub.md` over
    `.claude/agents/verifier.md`, fill in the three TODOs, rerun rung 1's verification path, and
    compare against `solutions/.claude/agents/verifier.md`.
15. **Bonus — build it: the dep-audit skill** — copy `build-it/dep-audit.SKILL.stub.md` over
    `.claude/skills/dep-audit/SKILL.md`, fill in the three TODOs, rerun `/dep-audit`, and compare
    against `solutions/.claude/skills/dep-audit/SKILL.md`.
16. **Bonus — build it: wire the trimmer hook** — clear `.claude/settings.json`'s `hooks` block
    and re-wire `trim-test-output.mjs` on `PreToolUse`/`Bash` by hand; confirm a failing
    `npm test` shows the dot reporter again.
17. **Bonus — agent teams** — with the experimental flag turned on by the attendee, three
    teammates propose competing hypotheses (e.g. for the kyc flakiness) and the attendee
    compares them; optional, does not block completion of steps 1-13.
