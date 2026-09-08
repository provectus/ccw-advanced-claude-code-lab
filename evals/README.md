# Evals kit

Grades the `money-movement-checklist` skill against five labelled diffs: does
it flag the planted finding, and nothing else. The shipped skill is
intentionally weak on item 3 (PII/card data in logs): the checklist bullet is worded fully, but
the output contract's severity line assigns nothing to item 3, so the skill invents a severity or
drops the finding. The solution skill differs by that one line ("high for 3 and 5") and passes 5/5.

Task-03's miss is the deliberate one. On a live model, any of the other four
tasks can occasionally miss too — that's ordinary run-to-run model variance,
not a defect in the skill or the grader: the checklist's own item titles and
severities for those findings (e.g. item 5, "Disabled tests" → `high`) are
fully pinned down in both the shipped and solution skill, unlike item 3.
If a baseline run comes in below 4/5, or a v2 run below 5/5, on a task other
than task-03, rerun once before concluding the edit didn't work.

```bash
npm run evals               # run all five tasks, write a results file
npm run evals -- --task task-03 --label my-edit
npm run evals:compare       # compare the two most recent results
```

A results file (`evals/results/<timestamp>-<label>.json`) holds `{ label,
model, started_at, tasks, pass_rate, total_cost_usd, total_tokens }`. One
number per prompt edit becomes two: pass-rate and cost.
