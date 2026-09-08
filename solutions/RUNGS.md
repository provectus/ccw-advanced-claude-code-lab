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
- **Decoys** (2, not in the key): kyc `node` `>=20` (`kyc/package.json:16`,
  under `engines` — not a dependency) · ledger `debug` `^4.4.0`
  (`ledger/package.json:14` — pinned to `4.4.3` by the root `package.json`'s
  `overrides`). A finder flags them; a verifier refutes them; a rung with no
  verifier merges them.
- **Every rung writes** `runs/dep-audit.md`: confirmed entries grouped by
  service, one line each —
  `- <name> <range> — <service>/package.json:<line> — <reason>` — plus a
  `## Refuted` section with one reason per line for anything that didn't
  hold up. Then it replies with exactly:
  `found <n>, confirmed <n>, refuted <n>`.
- **Score**: `<n>/4` where `n` = confirmed findings that match the answer
  key, minus confirmed entries that don't (a decoy, an `express` line,
  anything else not in the key), floored at 0. A merged decoy costs a point:
  `found 6, confirmed 6, refuted 0` scores `2/4`; `found 6, confirmed 4,
  refuted 2` scores `4/4`. Write *which* entry cost the point in the
  scorecard's "what could have gone wrong" column.
- **Scorecard row**:
  `npm run scorecard -- add "<rung>" --result "found <n>, confirmed <n>, refuted <n>" --score "<n>/4" --risk "<what could have gone wrong>"`.
- **Verified** means an evidence file records the command, its exit code,
  wall-clock time, the output, and a verdict of `match`, `partial`,
  `mismatch`, or `manual-only`, plus one sentence saying why.

Start the session with `claude --setting-sources project,local` — this repo's
`.claude/settings.json` and `.claude/settings.local.json` only, no user-level
plugins, MCP servers or skills, so `/context` and every ledger row measure the
repo's setup and are comparable across attendees.

Before each rung: `/clear`, then `rm -f runs/dep-audit.md`. `/clear` wipes the
conversation, not the ledger (the hooks write to `runs/token-ledger.jsonl` and
the scorecard reads it from disk), so each rung starts from the same baseline
and its row measures the harness rather than the cache reads of everything said
before it. Rung 5 starts a fresh process (the env var) and is already clean.

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
