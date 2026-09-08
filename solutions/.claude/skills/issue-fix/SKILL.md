---
name: issue-fix
description: Resolve the planted issues under issues/ (one per service) with one writer per service, verify each fix with the fix-verifier agent against the issue's acceptance criteria, and write a report. Usage - /issue-fix payments kyc ledger
disable-model-invocation: true
---

# issue-fix

Services to fix: `$ARGUMENTS` (space-separated folder names). If empty, fix `payments kyc ledger`.

Issue file per service: `payments` → `issues/payments-duplicate-payouts.md`,
`kyc` → `issues/kyc-status-leak.md`, `ledger` → `issues/ledger-idempotency-conflict.md`.

Run the three steps below in order. A step is a barrier: do not start the next one until every
agent of the current one has returned.

## Step 1 — Fix

Spawn one **general-purpose** sub-agent per service, all at once. Brief for each:

> Resolve `<issue file>`. Read the issue, then the service's `src/` and `tests/`. Edit only files
> under `<service>/`. Meet every numbered acceptance criterion, including the tests it asks for.
> Run `npm test -w <service>` and stop when it passes. Return a diff summary only — one line per
> changed hunk as `<file>:<line> — <what changed>` — no transcript, no explanation. Stop after
> 15 turns.

Collect the summaries. Count the services that returned one as **fixed**.

## Step 2 — Verify

Spawn one **fix-verifier** sub-agent per service, all at once. Brief for each:

> Issue: `<issue file>`. Service: `<service>/`. Try to break the fix.

Count the verdicts: `holds` and `fails`.

## Step 3 — Report

Write `runs/issue-fix.md`:

```
# issue-fix — <date>

## <service> — <issue title>
- verdict: holds | fails — <verifier's reason>
- changes:
  - <file>:<line> — <what changed>

## Summary
fixed <n>, holds <n>, fails <n>
```

One section per service, the verifier's one-line reason verbatim, the writer's diff summary
under it. Then reply to the user with exactly:

```
fixed <n>, holds <n>, fails <n>
```

Nothing else. No transcript, no summary of what the agents did.
