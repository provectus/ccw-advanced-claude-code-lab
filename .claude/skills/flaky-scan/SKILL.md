---
name: flaky-scan
description: Rerun one service's tests N times and report tests that failed in some runs but not all. Usage: /flaky-scan <service> [runs]
disable-model-invocation: true
argument-hint: <service> [runs]
---

# flaky-scan

Run `node .claude/skills/flaky-scan/scripts/rerun.mjs $ARGUMENTS` and read the JSON line it
prints: `{ service, runs, flaky: [{file, name, failed, runs}], alwaysFailing, durationMs }`.

Reply with exactly one line per entry in `flaky`:

`<file> › <test name> — failed <k>/<n> runs`

If `flaky` is empty, reply with exactly:

`No flaky tests in <service> over <n> runs.`

Nothing else. No transcript, no summary of what the script did, no mention of `alwaysFailing`
(a test that fails every run isn't flaky — that's a different problem).
