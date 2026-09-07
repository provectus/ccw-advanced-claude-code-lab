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

You will find these same five problems five different ways today: one
sub-agent, three parallel workers, a finished skill, a saved workflow, and a
goal loop. Finding them isn't the hard part — a careful human finds all five
in an afternoon too. The hard part is what each way costs to run and what
each way can quietly get wrong: a worker that drifts off-brief, a skill
that's confidently wrong about item 3, a fix that satisfies a test without
fixing anything. The scorecard is where you write that down, in your own
words, next to what it actually cost.

## Four kinds of skill in this repo

| skill | who invokes it | what it bundles | cost when idle | the step that uses it |
|---|---|---|---|---|
| `money-movement-checklist` | Claude, on its own, reviewing a diff | a text checklist | its description sits in context; full text loads only when used | Evals |
| `dep-audit` | you, `/dep-audit` | a 3-step sub-agent orchestration | zero — hidden from context until you type it | Rung 3 |
| `flaky-scan` | you, `/flaky-scan <service> [runs]` | a deterministic Node script | zero — hidden from context until you type it | Routine (primes `/goal` too) |
| `money-movement-conventions` | Claude, on its own, editing `payments/`, `kyc/`, or `ledger/` | six conventions, plain text | its description sits in context; full text loads only when used | A skill you never call |

## The scorecard

`npm run scorecard -- add "<step>" --result "<what came back>" --risk "<what
could have gone wrong>"` appends one row. `npm run scorecard` prints the
table.

| column | meaning |
|---|---|
| step | the rung or step you just ran |
| what came back | the artifact or answer, in your words |
| agents | sub-agents spawned since the last row |
| tokens | total tokens across those agents and turns |
| est $ | estimated cost, from `tools/ledger/prices.json` |
| wall | wall-clock time from the first ledger row to the last |
| what could have gone wrong | the risk you'd flag reviewing this at 5pm on a Friday |

By the end you have one table, a dozen-ish rows, that says more about the
five ways than any one of them says alone.
