# The five rungs — one task, five harnesses

Five ways to run the same job: the dependency audit across `payments/`,
`kyc/`, and `ledger/`. Same task, same answer key, every time — what
changes is the harness.

## The deliverable contract

- **Task**: the dependency audit across `payments/`, `kyc/`, `ledger/`.
- **Answer key** (4): payments `axios` `latest` (`payments/package.json:12`)
  · payments `lodash` `*` (`payments/package.json:14`) · kyc `dayjs`
  `>=1.11` (`kyc/package.json:12`) · ledger `uuid` `*`
  (`ledger/package.json:13`).
- **Every rung writes** `runs/dep-audit.md`: confirmed entries grouped by
  service, one line each —
  `- <name> <range> — <service>/package.json:<line> — <reason>` — plus a
  `## Refuted` section with one reason per line for anything that didn't
  hold up. Then it replies with exactly:
  `found <n>, confirmed <n>, refuted <n>`.
- **Score**: `<confirmed-and-correct>/4` — findings that are both confirmed
  and match the answer key above. A false positive doesn't subtract from
  the score; it goes in the scorecard's "what could have gone wrong"
  column instead.
- **Scorecard row**:
  `npm run scorecard -- add "<rung>" --result "found <n>, confirmed <n>, refuted <n>" --score "<n>/4" --risk "<what could have gone wrong>"`.
- **Verified** means an evidence file records the command, its exit code,
  wall-clock time, the output, and a verdict of `match`, `partial`,
  `mismatch`, or `manual-only`, plus one sentence saying why.

Before each rung: `rm -f runs/dep-audit.md`.

## Rung 1 — one sub-agent

Runs in any Claude Code session (interactive or `-p`).

```
Spawn one general-purpose subagent, read-only, to audit payments/, kyc/ and
ledger/ for dependencies whose package.json range is not an exact version
(*, latest, >=, ^, ~). It must verify each finding itself by re-reading the
manifest line, then write runs/dep-audit.md (confirmed entries grouped by
service, a Refuted section with reasons) and reply exactly:
found <n>, confirmed <n>, refuted <n>. Stop after 15 turns.
```

## Rung 2 — three parallel finders, no verifier

Runs in any Claude Code session (interactive or `-p`).

```
Run three subagents in background, one per service (payments / kyc / ledger),
each read-only: list every dependency in that service's package.json whose
range is not an exact version (*, latest, >=, ^, ~), as
<service>/package.json:<line> <name> <range>. No verification. When all three
return, merge their lists into runs/dep-audit.md grouped by service, and reply
exactly: found <n>, confirmed <n>, refuted <n> (confirmed = found, refuted 0).
Stop after 15 turns.
```

## Rung 3 — the skill

Runs in any Claude Code session (interactive or `-p`).

```
/dep-audit payments kyc ledger
```

## Rung 4 — the dynamic workflow

Runs in any Claude Code session (the ultracode workflow runs in `-p` too).

```
ultracode: audit payments/, kyc/ and ledger/ for unpinned dependencies; one
finder per service, verify each finding with the verifier agent, write
runs/dep-audit.md (confirmed by service, Refuted with reasons) and reply
exactly: found <n>, confirmed <n>, refuted <n>. Keep it small.
```

Save it as `/dep-audit-workflow` when prompted — a distinct name from the
rung-3 skill's `/dep-audit`. That save step is interactive-only; running
this in `-p` mode, note in your evidence that saving didn't happen.

## Rung 5 — the agent team

Interactive only. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` before
starting `claude`. If your setup doesn't support agent teams, write
`not run` in the scorecard and move on.

```
Spawn a team: three finder teammates (payments, kyc, ledger) that list
dependencies whose package.json range is not an exact version, and one
verifier teammate that tries to disprove every finding by re-reading the
manifest line. Write the consensus to runs/dep-audit.md (confirmed by
service, Refuted with reasons) and reply exactly:
found <n>, confirmed <n>, refuted <n>. Cap each teammate at 15 turns; stop
when the consensus is written.
```
