# ccw-advanced-claude-code-lab

Reference repo for the **Advanced Claude Code** workshop. Three small money-movement services (`payments`, `kyc`, `ledger`) with a few things wrong on purpose, a token ledger that records what every sub-agent costs you, and an evals kit for one skill.

## Quickstart

Read `CASE.md` first — it's the story the workshop follows.

```bash
git clone https://github.com/<your-username>/ccw-advanced-claude-code-lab.git
cd ccw-advanced-claude-code-lab
npm install
npm test            # one test is flaky on purpose
claude              # then follow the workshop steps
```

Requires Node 20+ and Claude Code 2.1.251 or newer (`claude update`).

The steps, prompts, and points live in the workshop app, not here. `CLAUDE.md` holds the rules Claude reads at every start. Finished versions of everything you write during the workshop are in `solutions/`.
