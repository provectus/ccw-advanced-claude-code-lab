---
name: dep-audit
description: Audit one or more services for unpinned dependencies, verify each finding with the verifier agent, and write a report of confirmed findings only. Usage - /dep-audit payments kyc ledger
disable-model-invocation: true
---

# dep-audit

Services to audit: `$ARGUMENTS` (space-separated folder names). If empty, audit `payments kyc ledger`.

Run the three steps below in order. A step is a barrier: do not start the next one until every agent of the current one has returned.

## Step 1 — Find

Spawn one **Explore** sub-agent per service, all at once, read-only. Brief for each:

> In `<service>/package.json`, list every entry under `dependencies` and `devDependencies` whose version is not an exact version (anything with `*`, `latest`, `>=`, `^`, `~`, or a range). Return one line per finding in the form `<service>/package.json:<line> <name> <range>`. Return nothing else. Do not read any other file.

Collect the lines. Count them as **found**.

## Step 2 — Verify

Spawn one **verifier** sub-agent per finding, all at once. Brief for each:

> Finding: unpinned dependency `<name>@<range>` at `<service>/package.json:<line>`. Try to refute it.

Keep the findings whose verifier replied `confirmed`. Count **confirmed** and **refuted**.

## Step 3 — Report

Write `runs/dep-audit.md`:

```
# dep-audit — <date>

## <service>
- <name> <range> — <service>/package.json:<line> — <verifier reason>

## Refuted
- <name> <range> — <service>/package.json:<line> — <verifier reason>
```

Confirmed findings only in the per-service sections, grouped by service, plus one entry per
refuted finding under "Refuted" with the verifier's one-line reason, so a refuted finding is
never dropped without a trace. Include every confirmed and every refuted finding — before
replying, re-read the file and check its entry count (confirmed + refuted) equals found; if it
doesn't, finish writing the missing entries first. Reply to the user with exactly:

```
runs/dep-audit.md — found <n>, confirmed <n>, refuted <n>
```

Nothing else. No transcript, no summary of what the agents read.
