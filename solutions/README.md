# solutions/

Finished copies of every `build-it/` stub, plus a few files with no stub counterpart.

- `.claude/agents/verifier.md` — finished verifier agent, byte-identical to the shipped
  `.claude/agents/verifier.md`. `build-it/verifier.stub.md` is the TODO version.
- `.claude/skills/dep-audit/SKILL.md` — finished dep-audit skill, byte-identical to the shipped
  `.claude/skills/dep-audit/SKILL.md`. `build-it/dep-audit.SKILL.stub.md` is the TODO version.
- `.claude/skills/money-movement-checklist/SKILL.md` — the strong checklist, all six items
  scored. The shipped skill is deliberately weak on item 3 (evals task-03 fails against it).
- `.claude/settings.json` — hooks wired, cost guard set; identical to the shipped one.
- `.claude/workflows/dep-audit-workflow.js` — the same plan as the skill above, authored as a
  saved dynamic-workflow script instead of a slash command (named `dep-audit-workflow` since the
  rung-3 skill already owns `/dep-audit` in the same session). No stub — rung 4 has attendees
  author and save their own.
- `.claude/agents/fix-verifier.md`, `.claude/skills/issue-fix/SKILL.md`,
  `.claude/workflows/issue-fix-workflow.js` — ladder B's verifier agent, rung-3 skill and
  rung-4 saved workflow; the agent and skill are byte-identical to the shipped ones under
  `.claude/`.
- `GOAL-FIX.md` — the kyc SLA bug, the good fix, two fixes that also go green but shouldn't, and
  the rubric to grade a `/goal` run against.
- `ISSUE-FIXES.md` — ladder B's answer key: the good fix per issue, the bad fixes that still
  pass the visible tests, and the rubric behind `npm run grade`.
- `RUNGS-ISSUES.md` — ladder B's five prompts, byte for byte, plus the deliverable contract
  (`runs/issue-fix.md` format, the reply line, the per-rung reset/grade loop).
- `PLANTED-FINDINGS.md` — the answer key. It spoils every step: file, line, and expected result
  for all five planted findings. Read it only if you're stuck or authoring the workshop text.
- `RUNGS.md` — the five rung prompts, byte for byte, plus the shared deliverable contract
  (`runs/dep-audit.md` format, the exact reply line, the score definition, the scorecard row
  command) that all five are graded against.
