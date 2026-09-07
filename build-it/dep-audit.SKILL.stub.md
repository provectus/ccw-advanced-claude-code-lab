---
name: dep-audit
description: Audit one or more services for unpinned dependencies, verify each finding with the verifier agent, and write a report of confirmed findings only. Usage - /dep-audit payments kyc ledger
disable-model-invocation: true
---

# dep-audit

Services to audit: `$ARGUMENTS` (space-separated folder names). If empty, audit `payments kyc ledger`.

Run the three steps below in order. A step is a barrier: do not start the next one until every agent of the current one has returned.

## Step 1 — Find

Spawn one **Explore** sub-agent per service, in parallel, read-only.

TODO: write the brief. It must name the thing to find (dependency ranges in that service's `package.json` that are not an exact version) and the return shape (`<service>/package.json:<line> <name> <range>`, one line per finding, nothing else).

## Step 2 — Verify

Spawn one **verifier** sub-agent (`.claude/agents/verifier.md`) per finding, in parallel.

TODO: pass exactly one finding per verifier, keep only the lines that come back `confirmed`, and count the `refuted` ones.

## Step 3 — Report

TODO: write `runs/dep-audit.md` with the confirmed findings only, grouped by service. Return to the user only the report path and three counts: found, confirmed, refuted. No transcript, no prose.
