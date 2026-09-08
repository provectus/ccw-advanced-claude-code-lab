# The case

It's Friday afternoon. A security review of the money-movement services —
`payments`, `kyc`, `ledger` — is due Monday morning. Whoever signs off on
Monday is reading a report, not a diff. You have one afternoon, three small
TypeScript services, and Claude Code.

## The five problems, in the open

1. **Unpinned dependencies** — `payments/package.json:12` (`axios: latest`),
   `payments/package.json:14` (`lodash: *`), `kyc/package.json:12`
   (`dayjs: >=1.11`), `ledger/package.json:13` (`uuid: *`). A transitive
   update lands in production unreviewed, unpinned by any lockfile override.
   Two decoys sit next to them: `kyc/package.json:16` (`node: >=20` — an
   operator, but under `engines`, not a dependency) and
   `ledger/package.json:14` (`debug: ^4.4.0` — an open range that the root
   `package.json`'s `overrides` block pins to `4.4.3`). A finder that greps
   for operators flags both; only a verifier that reads past the cited line
   refutes them.
2. **A route with no auth check** — `ledger/src/app.ts:35`, `POST /transfer`,
   is the only money-moving route in the three services that never calls
   `requireAuth` or `verifyToken`. Anyone who can reach it can move money.
3. **A flaky test that's actually a real bug** — `kyc/src/verification.ts:47-49`
   simulates provider latency with `Math.random()` (5-44ms);
   `kyc/tests/sla.test.ts:10` asserts a 25ms SLA. The test is right about
   half the time; the code has non-determinism where a test needs to
   reason about it deterministically.
4. **A live secret checked into source** — `payments/src/config.ts:4` holds a
   `sk_live_` key as a string literal instead of an environment read. It's in
   git history the moment it's committed.
5. **A checklist that misses one of its own items** — `.claude/skills/money-movement-checklist/SKILL.md`
   names PII/card data in logs as item 3, then assigns a severity to every
   item except 3. Graded against a diff that leaks a card number to
   `console.log`, it misses.

## The five problems, in plain words

Same five, one paragraph each: what is wrong, why anyone should care, what you can actually
observe in this repo, and what a fix looks like. The lab grades *finding* most of these, not
fixing them — the fixes are here so you know what you are looking at.

### 1. Unpinned dependencies

**What's wrong.** Four manifest entries let `npm install` choose the version: `latest` and `*`
accept anything ever published; `>=1.11` accepts every future release including the next major.
**Why it matters.** The next install — a new laptop, a CI runner, a Friday deploy — can pull a
version nobody reviewed. A breaking change or a compromised release lands in production without
a diff anyone read. The lockfile does not protect you: it records what was picked *last* time,
and is regenerated whenever someone runs `npm install` without `--frozen-lockfile`/`npm ci`.
**What you'll see in the repo.** Nothing. `npm install` succeeds, `npm test` passes, every
service starts. The only way to see it is to read the four `package.json` files — which is why
this is the problem the five rungs audit. Two decoys sit beside the real ones: `engines.node
>=20` is a Node version requirement, not a package; `debug ^4.4.0` looks unpinned but the root
`package.json`'s `overrides` block forces `4.4.3`, so no install can move it.
**The fix.** Exact versions in the manifest (`"axios": "1.7.9"`), the lockfile committed and
installed with `npm ci`, and upgrades arriving as reviewed pull requests (Renovate or Dependabot)
instead of silently at install time. Not a lab step — the lab measures what it costs to *find*.

### 2. A money-moving route with no auth check

**What's wrong.** `POST /transfer` (`ledger/src/app.ts:35`) is the only route in `ledger` that
does not pass `requireAuth(...)`. Its siblings — open an account, read a balance, list entries —
all do.
**Why it matters.** Anyone who can reach port 4003 can move money between any two accounts. No
token, no scope, no identity in the audit trail.
**What you'll see in the repo.** Start the service (`npm run dev:ledger`) and `POST /transfer`
with a JSON body and *no* `Authorization` header: `201`. Do the same to `POST /accounts`: `401`.
The tests pass because no test asserts a 401 on `/transfer` — a missing test is what let a
missing check ship.
**The fix.** `app.post('/transfer', requireAuth('ledger:write'), ...)` plus a test that sends no
token and expects `401`. In the lab you never fix it directly: the `money-movement-conventions`
skill gives the new `/refund` route this check automatically (step 3), and the
`money-movement-checklist` skill is graded on flagging the missing one (step 12).

### 3. A flaky test that is a real bug

**What's wrong.** `kyc/src/verification.ts:47-49` simulates a document-provider round trip with
`5 + Math.floor(Math.random() * 40)` milliseconds. `kyc/tests/sla.test.ts:10` asserts the check
finishes within 25 ms.
**Why it matters.** An SLA is a promise about the worst case, so the test is right. The code is
wrong: it puts randomness in a path a test has to reason about deterministically. The tempting
"fixes" — raise the threshold, skip the test, delete the assertion — make the suite green and
keep the bug.
**What you'll see in the repo.** `npm test` fails roughly every other run, always on the same
test (`expected 41 to be less than or equal to 25`, some number above 25). `npm run test:stable`
excludes it on purpose so `npm run check` stays deterministic. `/flaky-scan kyc 4` reruns the
suite four times and prints the one test that failed in some runs but not all.
**The fix.** Make the latency injectable — a parameter or environment variable `runChecks` reads,
defaulting to today's random behaviour — so the test pins it and production keeps its
simulation. `sla.test.ts` stays untouched. Two fixes that go green and are still wrong: narrowing
the random range until it always clears 25 ms, and busy-waiting instead of sleeping. Graded in
step 11 against `solutions/GOAL-FIX.md`.

### 4. A live secret in source

**What's wrong.** `payments/src/config.ts:4` sets `providerApiKey` to an `sk_live_...` string
literal. Every other setting in that file reads `process.env`.
**Why it matters.** The moment it is committed it is in git history on every clone and every
fork, forever; rotating it means a new commit; and anyone with read access to the repo can charge
the provider account.
**What you'll see in the repo.** Nothing at runtime — the service starts and the tests pass.
`grep -rn sk_live_ payments/src` shows it in one line. It is one of the five labelled diffs the
evals kit feeds the checklist skill, which must flag it as `critical`.
**The fix.** `process.env.PROVIDER_API_KEY` with a startup check that refuses to boot without it,
rotate the leaked key at the provider, and add a secret scanner to CI so the next one never
lands. In the lab, the checklist skill is graded on catching it (step 12).

### 5. A checklist that is silent about one of its own items

**What's wrong.** `.claude/skills/money-movement-checklist/SKILL.md` lists six items. Item 3, PII
or card data in logs, is worded fully — but the output contract underneath assigns a severity to
items 1, 2, 4, 5 and 6 and says nothing about 3.
**Why it matters.** A skill that knows what to look for but not how serious it is will invent a
severity or quietly drop the line. A review tool that is confidently silent about card numbers
in logs is worse than no tool: people stop reading the diff themselves.
**What you'll see in the repo.** `npm run evals -- --label baseline` grades the skill against
five labelled diffs and prints `pass 4/5`, with a `missed:` line under `task-03` — the diff that
writes a full card number and CVV to the payments log. The grader hard-codes `high` for that
finding.
**The fix.** One line: make the severity sentence read "`critical` for items 1 and 2, `high` for
3 and 5, `medium` for 4 and 6". Rerun as `v2`: `pass 5/5`. `npm run evals:compare` shows the
pass-rate and cost delta side by side. That one-line diff is the entire difference between the
shipped skill and `solutions/.claude/skills/money-movement-checklist/SKILL.md`.

### Words that come up

| term | meaning here |
|---|---|
| minor units | amounts are integers in cents (`amountCents: 2500` = 25.00), never floats — no rounding drift, no `0.1 + 0.2` |
| idempotency key | a caller-chosen string sent with a transfer or payout; a retry with the same key returns the original entry instead of moving the money twice |
| scope | what a token is allowed to do — `ledger:read` can see balances, `ledger:write` can move money; `requireAuth('ledger:write')` checks both the token and the scope |
| manifest vs lockfile | `package.json` says what you *want* (a range); `package-lock.json` records what you *got* last time. Only the manifest is a promise |
| exact version vs range | `5.2.1` installs one thing; `*`, `latest`, `>=`, `^`, `~` let the installer choose |
| `overrides` | a block in the *root* `package.json` that forces one version of a package for the whole workspace, whatever the ranges say — the one thing that turns a range into a pin without editing it |

## What the workshop is actually about

Today you run the same dependency audit — finding 1, the four unpinned
ranges across `payments/`, `kyc/`, and `ledger/` — five different ways: one
sub-agent that verifies itself, three parallel finders with no verifier, the
finished `/dep-audit` skill, the dynamic workflow, and an agent team. Same
services, same four-item answer key, same reply format
(`found <n>, confirmed <n>, refuted <n>`). What changes is the harness, and
the harness is what you're actually grading. A finder can over-report and
still call it done — the two decoys make sure at least one of them does. A
merged list from three workers is only as good as the human who never
checked it. A report can drop a real finding while the reply
line still claims four. A team's consensus is only as good as its verifier.
The scorecard's `correct` column is where you write down, against the same
four findings every time, which harness actually got it right — and next to
it, what it cost you to find out.

## Four kinds of skill in this repo

| skill | who invokes it | what it bundles | cost when idle | the step that uses it |
|---|---|---|---|---|
| `money-movement-checklist` | Claude, on its own, reviewing a diff | a text checklist | its description sits in context; full text loads only when used | Evals |
| `dep-audit` | you, `/dep-audit` | a 3-step sub-agent orchestration | zero — hidden from context until you type it | Rung 3 |
| `flaky-scan` | you, `/flaky-scan <service> [runs]` | a deterministic Node script | zero — hidden from context until you type it | Routine (primes `/goal` too) |
| `money-movement-conventions` | Claude, on its own, editing `payments/`, `kyc/`, or `ledger/` | six conventions, plain text | its description sits in context; full text loads only when used | A skill you never call |

## The scorecard

`npm run scorecard -- add "<step>" --result "<what came back>" --score
"<n/4>" --risk "<what could have gone wrong>"` appends one row. `npm run
scorecard` prints the table.

| column | meaning |
|---|---|
| step | the rung or step you just ran |
| what came back | the artifact or answer, in your words |
| correct | out of 4: confirmed findings that match the answer key, minus confirmed entries that don't (a decoy, `express`, anything not in the key), floored at 0 — so `found 6, confirmed 6` with the four real ones inside reads `2/4`, not `4/4` |
| agents | sub-agents spawned since the last row |
| tokens | total tokens across those agents and turns |
| est $ | estimated cost, from `tools/ledger/prices.json` |
| wall | wall-clock time from the first ledger row to the last |
| what could have gone wrong | the risk you'd flag reviewing this at 5pm on a Friday |

By the end you have one table, a dozen-ish rows, that says more about the
five ways than any one of them says alone.
