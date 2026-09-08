# Planted findings — answer key

Spoils every step. Read only if you're stuck or writing the workshop text. Line numbers below were
read from the files in this repo, not reconstructed from the spec.

## 1. Unpinned dependencies (all three manifests) — all five rungs

- `payments/package.json:12` — `"axios": "latest"`
- `payments/package.json:14` — `"lodash": "*"`
- `kyc/package.json:12` — `"dayjs": ">=1.11"`
- `ledger/package.json:13` — `"uuid": "*"`

`express` is pinned exact (`5.2.1`) in all three and is not a finding. None of the four are pinned
by the root `package.json`'s `overrides` block (it names only `debug`; the lockfile just repeats
the loose ranges), so all four are genuinely **confirmed**, not refutable.

### Decoys — planted so a verifier has something to refute

- `kyc/package.json:16` — `"node": ">=20"` under `engines`. An operator from the finder's list,
  but not a dependency. Refuted: *not an installed dependency*.
- `ledger/package.json:14` — `"debug": "^4.4.0"` under `dependencies`. A real open range — but the
  root `package.json` has `"overrides": { "debug": "4.4.3" }`, so `npm install` cannot re-resolve
  it. Refuted: *pinned by the root overrides block*. The verifier only finds this by grepping past
  the cited line, which its Rules explicitly allow.

Every finder flags `debug` (it is a `^` inside `dependencies`). Only finders that read beyond
`dependencies`/`devDependencies` flag `engines`, so `found` is 5 or 6 depending on the brief —
grade the confirmed entries against the four-item key, not the `found` count. A rung with no
verifier (rung 2) merges whatever was flagged; a rung with one refutes it and writes the reason
under "Refuted". Placing them in `kyc/` and `ledger/` keeps `payments/` clean, so the rung-3
calibration run (`/dep-audit payments`) still reads `found 2, confirmed 2, refuted 0`, and
`evals/tasks/task-05.diff` (a diff against `payments/package.json`) still applies.

Consumed by: all five rungs — one self-verifying sub-agent (rung 1), three background finders
with no verifier (rung 2), the `dep-audit` skill (rung 3), the saved dynamic workflow (rung 4),
and the agent team (rung 5) — the same task run five ways. See "Expected result per rung" below.
Expected result of every *verified* rung: **found 5–6, confirmed 4, refuted 1–2** — the four key
entries confirmed, the decoy(s) under "Refuted" with the verifier's one-line reason. Rung 2 has
no verifier, so it reads **found 5–6, confirmed 5–6, refuted 0** and its report carries the
decoy(s) as if they were findings.

### Score

`<n>/4`, where `n` = confirmed entries that match the key, minus confirmed entries that don't,
floored at 0. A merged decoy costs a point: rung 2 typically scores **2/4** (both decoys merged)
or **3/4** (only `debug`); every rung whose verifier holds scores **4/4**. This is the column
where the harnesses stop looking identical.

## Expected result per rung

Costs measured on Sonnet, headless, 2026-09-07, *before* the decoys were planted; evidence in
`runs/evidence/v3/`. Expected counts below are for the current manifests (with decoys) and have
not been re-measured — agent counts rise by one verifier per decoy flagged. Rung 5 is
interactive-only and wasn't measured.

| rung | harness | expected found/confirmed/refuted | score | typical agents | typical cost (pre-decoy) |
|---|---|---|---|---|---|
| 1 | one sub-agent, self-verifying | 5–6 / 4 / 1–2 | 4/4 | 1 | ≈ $0.15 |
| 2 | three background finders, no verifier | 5–6 / 5–6 / 0 | **2/4–3/4** | 3 | ≈ $0.18 |
| 3 | `/dep-audit` skill | 5–6 / 4 / 1–2 | 4/4 | 8–9 (3 finders + 5–6 verifiers) | ≈ $0.25 |
| 4 | dynamic workflow (`/dep-audit-workflow`) | 5–6 / 4 / 1–2 | 4/4 | 9–10 (3 finders + 5–6 verifiers + 1 report) | ≈ $0.29 |
| 5 | agent team (interactive) | 5–6 / 4 / 1–2 | 4/4 if the verifier holds | 4 teammates (not measured) | not measured |

Failure shapes worth recognising: rung 1 confirming `debug` because the worker never left the
cited line (3/4); rung 3 or 4 replying `refuted 0` with `debug` under a service heading — the
verifier didn't grep the root manifest; rung 5's verifier teammate agreeing with every finder
(2/4–3/4 at four sessions' price).

### Observed shapes (pre-decoy runs)

- **Rung 1** replied `found 7, confirmed 4, refuted 3`, not the clean `found 4, confirmed 4,
  refuted 0` of the other rungs: the sub-agent counted the correctly-pinned `express` entry in
  all three manifests as a candidate and then refuted it itself, and cited ledger's `uuid`
  finding at `:14` instead of the actual `:13`. The score is still **4/4** — all four confirmed
  entries were correct by name and range — but the found/confirmed/refuted count and the line
  number drifted from the key, which is exactly what the risk column exists to catch by hand.
- **Rung 3**'s reply came back wrapped in a code fence rather than a bare line — worth checking
  for when grading the reply format, not just its content.
- **Rung 4**'s ledger rows carry whatever `agent_type` labels the generated workflow script gave
  its agents (`Explore`/`verifier` in the measured run), not a fixed `workflow-subagent` tag —
  read the ledger by scope, not by a hardcoded label.

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

## 5. Token-verification call sites across services — reference count only

The spec text says "three token-verification call sites across services"; the real count in this
repo is **six** call expressions (not counting the three `export function verifyToken` definitions
or the two `import { verifyToken }` statements). Use the real count if this is ever used as a
scoped-Explore example — it's what an Explore sub-agent will actually return.

- `payments/src/app.ts:17` — inside `POST /payouts`
- `payments/src/app.ts:33` — inside `GET /payouts/summary`
- `payments/src/app.ts:49` — inside `GET /payouts/:id`
- `payments/src/app.ts:64` — inside `GET /accounts/:accountId/payouts`
- `kyc/src/app.ts:17` — inside `POST /applicants/:id/verify`
- `ledger/src/auth.ts:38` — inside the `requireAuth(scope)` middleware factory (ledger's routes
  call `requireAuth(...)`, which calls `verifyToken` once per request; there is no direct
  `verifyToken(...)` call written in `ledger/src/app.ts`)

Consumed by: nothing in v3. In v2 this was rung 1's scoped read-only Explore sub-agent target
("every call site of `verifyToken`, not `look at auth`"); v3's rung 1 runs the same dependency
audit as the other four rungs instead, so this finding is no longer a step target — kept here
only as a reference count in case a facilitator wants a second scoped-Explore example.

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
4. **Rung 1 — one sub-agent, self-verifying** — one general-purpose sub-agent, read-only, audits
   `payments/`, `kyc/`, and `ledger/` for dependencies whose manifest range isn't an exact
   version, verifies each finding itself by re-reading the manifest line, and writes
   `runs/dep-audit.md` (confirmed grouped by service, a Refuted section with reasons); capped at
   15 turns. Expected reply: **found 5–6, confirmed 4, refuted 1–2** (finding 1 plus the decoys
   refuted). Score 4/4; a worker that confirms `debug` without grepping for the root override
   scores 3/4. `npm run scorecard -- add "Rung 1" --result "found 5, confirmed 4, refuted 1" --score "4/4" ...`
   records the row.
5. **Read the meter (ledger)** — `npm run tokens` after step 4 shows one row for the sub-agent
   with its own token counts, model, and estimated cost, distinct from the main session's row.
6. **Rung 2 — three background finders, no verifier** — three sub-agents run in background, one
   per service (`payments`/`kyc`/`ledger`), each read-only, each listing every unpinned
   dependency in its own manifest as `<service>/package.json:<line> <name> <range>` with no
   verification step. When all three return, their lists are merged into `runs/dep-audit.md`
   grouped by service, and the reply is **found 5–6, confirmed 5–6, refuted 0** by construction
   (confirmed = found) — the `debug` decoy, and usually the `engines` one, land in the report as
   findings. Score **2/4 or 3/4**: this is the row where the ladder first visibly diverges, and
   nothing in the rung's design could have caught it. A scorecard row is added.
7. **Rung 3 — run the finished `/dep-audit`** — attendee reads the ten lines of the skill that
   matter (the three steps) before running it; `/dep-audit payments` calibrates at
   **found 2, confirmed 2, refuted 0** (no decoy in payments); `/dep-audit payments kyc ledger`
   produces `runs/dep-audit.md` and replies with **found 5–6, confirmed 4, refuted 1–2**, the
   decoy(s) under "Refuted" with the verifier's reason (`debug` — pinned by root overrides;
   `node` — under engines, not a dependency). A scorecard row is added, `--score "4/4"` if the
   four confirmed entries match the key and nothing else is confirmed.
8. **Rung 4 — dynamic workflow** — an ultracode workflow audits `payments/`, `kyc/`, and
   `ledger/` for unpinned dependencies, one finder per service, verifying each finding with the
   verifier agent; it shows Find/Verify/Report phases live with per-agent tokens. Saving it (as
   `/dep-audit-workflow` — a distinct name from the rung-3 skill's `/dep-audit`) produces a
   script equivalent to `solutions/.claude/workflows/dep-audit-workflow.js`. Expected reply:
   **found 5–6, confirmed 4, refuted 1–2**, reproducing step 7's counts; the ledger shows one
   verifier row per finding flagged, decoys included. A scorecard row is added.
9. **Rung 5 — agent team** (interactive; `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set by the
   attendee before starting `claude`) — a team of three finder teammates (payments/kyc/ledger)
   and one verifier teammate that tries to disprove every finding by re-reading the manifest
   line; the consensus is written to `runs/dep-audit.md` with a reply of
   **found 5–6, confirmed 4, refuted 1–2** (finding 1, decoys refuted), assuming the verifier
   holds the line — a consensus is only as good as its verifier. If it rubber-stamps, the team
   reproduces rung 2's report (2/4–3/4) at four full sessions' price. If the attendee's setup doesn't support agent
   teams, the scorecard row reads `not run` instead of a score, and the workshop continues.
10. **Compare the rungs** — `npm run scorecard` prints all five rung rows with the `correct`
    column filled in against the four-item answer key; rung 2 reads 2/4 or 3/4 while every
    verified rung reads 4/4 — same finders, same manifests, the only difference is whether
    anything re-read the line before the merge. The attendee fills in "what could have
    gone wrong" for each (the decoy rung 2 merged, a merged list nobody verified,
    a real finding dropped from rung 3 or 4's report while the reply line still says four, rung
    5's consensus only as good as its verifier — or `not run` if it wasn't), then answers: which
    rung would you run again tomorrow, and what did each extra rung buy over the one before it?
11. **`/goal` on kyc** — the attendee opens with `/flaky-scan kyc 4` to show the SLA test failing
    some (or all) of 4 runs, proving the flake before touching any code. Then a goal against
    `kyc/tests/sla.test.ts` with a stated check (`npm test -w kyc` passes) and a turn cap
    converges on the fix in `kyc/src/verification.ts` (finding 3), with the edit-guard hook
    restricting edits to `kyc/`; the attendee grades Claude's diff against `GOAL-FIX.md`'s
    rubric — editing the test is a failed attempt, not success, and a busy-wait/polling fix that
    hides the randomness rather than fixing it should also read as a miss.
12. **Grade the checklist skill (evals)** — `npm run evals` runs the shipped
    `money-movement-checklist` skill headless against the five labelled diffs: baseline is
    **4/5**, missing task-03 (checklist item 3 is worded fully but has no severity in the output
    contract), with the missed pattern printed inline; the attendee adds item 3 to the `high`
    severity line to match
    `solutions/.claude/skills/money-movement-checklist/SKILL.md` and reruns to **5/5**, reporting
    the pass-rate and cost delta.
13. **Create one routine** — a scheduled routine's prompt body is: "Run `/flaky-scan kyc 3`. For
    each flaky test open one GitHub issue titled `flaky: <test name>` with the line the skill
    printed. If it prints no flaky tests, do nothing. Stop after 15 turns." No countdown, no
    interactive prompt — it either opens zero issues (clean run) or one issue per flaky test.
14. **Bring the scorecard** — attendee has one table, `runs/scorecard.md`, with a row per rung
    plus `/goal` and evals, each with agents/tokens/est $/wall, the `correct` score against the
    answer key, and the risk column filled in.
15. **Bonus — build it: the verifier** — copy `build-it/verifier.stub.md` over
    `.claude/agents/verifier.md`, fill in the three TODOs, rerun rung 3's verification step
    (`/dep-audit`'s Step 2, which spawns one `verifier` sub-agent per finding), and compare
    against `solutions/.claude/agents/verifier.md`. The real test of a hand-written verifier is
    `/dep-audit ledger`: it must refute `debug` (root `overrides`) and still confirm `uuid`.
16. **Bonus — build it: the dep-audit skill** — copy `build-it/dep-audit.SKILL.stub.md` over
    `.claude/skills/dep-audit/SKILL.md`, fill in the three TODOs, rerun `/dep-audit`, and compare
    against `solutions/.claude/skills/dep-audit/SKILL.md`.
17. **Bonus — build it: wire the trimmer hook** — clear `.claude/settings.json`'s `hooks` block
    and re-wire `trim-test-output.mjs` on `PreToolUse`/`Bash` by hand; confirm a failing
    `npm test` shows the dot reporter again.
