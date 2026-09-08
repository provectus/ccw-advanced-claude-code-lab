# Workshop guide

## What the workshop is

One Friday afternoon, three small money-movement services, and five problems planted on purpose
— see [CASE.md](CASE.md) for the story. You run one dependency audit five different ways (the
ladder below), then converge on a real fix with `/goal`, grade a skill against an evals kit,
schedule a routine, and end with one scorecard that says what every step cost.

## Where the steps and points live

The steps, prompts, and points live in the workshop app, not here. This file maps the repo's
files and commands to those steps, so you can follow along in a terminal alongside the app.

## The ladder

Five ways to run the same dependency audit across `payments/`, `kyc/`, and `ledger/`. The full
prompts, byte for byte, and the deliverable contract they all share are in
[solutions/RUNGS.md](solutions/RUNGS.md): every rung writes `runs/dep-audit.md` (confirmed
entries grouped by service, a `## Refuted` section with reasons) and replies with exactly
`found <n>, confirmed <n>, refuted <n>`. Start the session with
`claude --setting-sources project,local` (this repo's settings only). Before each rung: `/clear`
(the ledger and scorecard live on disk and survive it; the conversation's cache reads don't, so
each row measures one harness from the same baseline), then `rm -f runs/dep-audit.md`. After each
rung:

```bash
npm run scorecard -- add "<rung>" --result "<the reply>" --score "<n>/4" --risk "<what could have gone wrong>"
```

The answer key has four entries; two decoys sit next to them (kyc's `engines` range, ledger's
`debug` range pinned by a root `overrides`). Every finder flags at least the `debug` one, so the
rungs stop agreeing the moment nothing re-reads the line before it is merged:

| rung | harness | prompt | expected reply | score | what it teaches |
|---|---|---|---|---|---|
| 1 | one sub-agent, self-verifying | RUNGS.md § Rung 1 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | what one careful sub-agent costs, and where its own verification can still drift |
| 2 | three background finders, no verifier | RUNGS.md § Rung 2 | `found 5–6, confirmed 5–6, refuted 0` (confirmed = found, by construction) | 2/4–3/4 | a merged list is only as good as whoever checks it afterward — here, no one does, and the decoys land in the report |
| 3 | `/dep-audit` skill | RUNGS.md § Rung 3 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | what a finished find/verify/report skill buys over ad hoc prompting — a Refuted section with reasons |
| 4 | dynamic workflow, saved as `/dep-audit-workflow` | RUNGS.md § Rung 4 | `found 5–6, confirmed 4, refuted 1–2` | 4/4 | the same shape as rung 3, built and saved by you |
| 5 | agent team (interactive) | RUNGS.md § Rung 5 | `found 5–6, confirmed 4, refuted 1–2`, or `not run` | 4/4 | a consensus is only as good as its verifier teammate — if it rubber-stamps, you bought rung 2 at four sessions' price |

`found` varies by one because kyc's `engines` decoy is only flagged by finders that read past
`dependencies`/`devDependencies`; ledger's `debug` decoy is flagged by every finder. Grade the
confirmed entries against the key, not the `found` count.

## The instruments

- **Token ledger** — `SubagentStop`/`Stop` hooks append one line per finished sub-agent or turn
  to `runs/token-ledger.jsonl`; `npm run tokens` prints a table priced per model from
  `tools/ledger/prices.json`. `tools/ledger/dedupe.mjs` is a one-off repair tool that
  re-verifies each row against its own transcript on disk — only needed against a ledger file
  written by an older hook version, not a routine step.
- **Status line** — `tools/statusline/statusline.mjs`, wired via `statusLine` in
  `.claude/settings.json`. The live counterpart to the ledger: it parses the session and
  sub-agent transcripts directly, so it counts agents that are still running, and it keeps
  `new`/`cw`/`cr`/`out` separate instead of summing them into one "tokens" figure. `ctx` is the
  current window occupancy (last message only), not a running total, measured against
  `tools/statusline/context-windows.json` — 1M by default, edit that file as models change.
  `npm run statusline` renders it once for testing.
- **Scorecard** — `npm run scorecard -- add "<step>" --result "<what came back>" --score "<n/4>"
  --risk "<what could have gone wrong>"` appends one row; `npm run scorecard` prints the table:
  step, what came back, `correct` (out of 4: confirmed findings in the key, minus confirmed
  entries that aren't — a merged decoy costs a point), agents, tokens, est $, wall, and the risk
  column.
- **Evals kit** (`evals/`) — grades the `money-movement-checklist` skill headless against five
  labelled diffs: `npm run evals`, `npm run evals:compare`.
- **flaky-scan** (`.claude/skills/flaky-scan`) — `/flaky-scan <service> [runs]` reruns a
  service's tests N times and reports which tests failed in some runs but not all; no LLM calls.
- **Four kinds of skill** — see the table in [CASE.md](CASE.md).
- **The verifier agent** (`.claude/agents/verifier.md`) — one sub-agent per finding, tries to
  refute it by re-reading the cited line; used by `/dep-audit` (rung 3) and the saved workflow
  (rung 4).
- **The saved workflow** (`solutions/.claude/workflows/dep-audit-workflow.js`) — rung 4's
  Find/Verify/Report script, saved under a name distinct from the rung-3 skill's `/dep-audit`.

## Build-it bonus track

Copy a stub over its finished counterpart under `.claude/`, fill in the TODOs, rerun the step,
and compare against the finished version — see [build-it/README.md](build-it/README.md) for the
how, and [solutions/README.md](solutions/README.md) for the full list of what's already finished
there (the verifier agent, the dep-audit skill, the strong checklist skill, the saved workflow,
and `GOAL-FIX.md`'s rubric).

## Attendee prerequisites and gotchas

- Claude Code 2.1.251 or newer (`claude update`).
- Start it with `claude --setting-sources project,local` so user-level plugins, MCP servers and
  skills stay out of the context window and the token ledger.
- A plan with workflows enabled — rung 4's dynamic workflow needs it.
- Node 20+.
- `gh` authenticated — the routine step opens GitHub issues.
- Fork the repo: a scheduled routine needs to own the repo it runs against, and Issues must be
  enabled on your fork for the routine step to open them.
- On Windows, use Git Bash, not PowerShell — a PowerShell-piped command adds a byte-order mark
  that broke the token ledger hook in testing.
- Agent teams (rung 5) need `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` exported before starting
  `claude`. If your setup doesn't support it, write `not run` in the scorecard and keep going.

## Cost

The measured core run — rungs 1 through 4, plus evals and the hook/structure check — cost
**$1.21** on Sonnet. Every fan-out prompt in the workshop carries a cost guard: a turn cap when
interactive, `--max-budget-usd` when headless (see `CLAUDE.md`'s Cost guards).

## Step map

Maps each of the 17 workshop steps to what you actually touch or run in this repo. No answer
key here — see [solutions/PLANTED-FINDINGS.md](solutions/PLANTED-FINDINGS.md) for the exact
files, lines, and expected diffs, if you're stuck or authoring workshop text.

| # | step | repo artifacts |
|---|---|---|
| 1 | The case | `CASE.md`, `npm install`, `npm test` |
| 2 | Size it (skippable) | `/context`, `/usage`, `.claude/hooks/trim-test-output.mjs` |
| 3 | A skill you never call | `ledger/`, `.claude/skills/money-movement-conventions` |
| 4 | Rung 1 | one self-verifying sub-agent, `runs/dep-audit.md`, `npm run scorecard` |
| 5 | Read the meter | `npm run tokens` |
| 6 | Rung 2 | three background finders, `runs/dep-audit.md` |
| 7 | Rung 3 | `/dep-audit`, `.claude/skills/dep-audit` |
| 8 | Rung 4 | an ultracode workflow, saved as `/dep-audit-workflow` |
| 9 | Rung 5 | an agent team, interactive, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| 10 | Compare the rungs | `npm run scorecard` |
| 11 | `/goal` on kyc | `/flaky-scan kyc`, `/goal`, `kyc/`, `solutions/GOAL-FIX.md` |
| 12 | Grade the checklist skill | `npm run evals`, `.claude/skills/money-movement-checklist` |
| 13 | Create one routine | `/flaky-scan kyc 3`, a scheduled routine, GitHub issues |
| 14 | Bring the scorecard | `runs/scorecard.md` |
| 15 | Bonus — build it: the verifier | `build-it/verifier.stub.md` → `.claude/agents/verifier.md` |
| 16 | Bonus — build it: the dep-audit skill | `build-it/dep-audit.SKILL.stub.md` → `.claude/skills/dep-audit/SKILL.md` |
| 17 | Bonus — build it: wire the trimmer hook | `.claude/settings.json`, `.claude/hooks/trim-test-output.mjs` |
