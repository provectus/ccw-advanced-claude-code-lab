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
   is weak on PII/card data in logs. It will pass a diff that leaks a card
   number to `console.log`.

## What the workshop is actually about

Today you run the same dependency audit — finding 1, the four unpinned
ranges across `payments/`, `kyc/`, and `ledger/` — five different ways: one
sub-agent that verifies itself, three parallel finders with no verifier, the
finished `/dep-audit` skill, the dynamic workflow, and an agent team. Same
services, same four-item answer key, same reply format
(`found <n>, confirmed <n>, refuted <n>`). What changes is the harness, and
the harness is what you're actually grading. A finder can over-report and
still call it done. A merged list from three workers is only as good as the
human who never checked it. A report can drop a real finding while the reply
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
| correct | confirmed-and-correct findings out of 4, checked against the answer key (e.g. `3/4`); a false positive goes in "what could have gone wrong", not here |
| agents | sub-agents spawned since the last row |
| tokens | total tokens across those agents and turns |
| est $ | estimated cost, from `tools/ledger/prices.json` |
| wall | wall-clock time from the first ledger row to the last |
| what could have gone wrong | the risk you'd flag reviewing this at 5pm on a Friday |

By the end you have one table, a dozen-ish rows, that says more about the
five ways than any one of them says alone.
