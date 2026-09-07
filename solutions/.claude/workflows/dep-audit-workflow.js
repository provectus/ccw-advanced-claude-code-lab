// Saved dynamic workflow for the dep-audit skill (rung 4). Press `s` after a /workflows run to
// save a script like this one; `/dep-audit-workflow` (or Workflow({name: 'dep-audit-workflow'}))
// reruns it. Named distinctly from `/dep-audit` because the rung-3 skill already owns that
// command in the same session.
// args: { services: ['payments', 'kyc', 'ledger'] } — defaults to all three services.

export const meta = { name: 'dep-audit-workflow', description: 'One finder per service, verify each finding, report confirmed only', phases: [{ title: 'Find' }, { title: 'Verify' }, { title: 'Report' }] }

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' }, name: { type: 'string' }, range: { type: 'string' } }, required: ['file', 'line', 'name', 'range'] } } }, required: ['findings'] }
const VERDICT = { type: 'object', properties: { confirmed: { type: 'boolean' }, reason: { type: 'string' } }, required: ['confirmed', 'reason'] }

const services = args?.services ?? ['payments', 'kyc', 'ledger']

phase('Find')
const perService = await parallel(services.map((service) => () =>
  agent(
    `In ${service}/package.json, list every entry under dependencies and devDependencies whose version is not an exact version (anything with *, latest, >=, ^, ~, or a range). Report the file path, line number, dependency name, and version range for each. Do not read any other file.`,
    { label: `find:${service}`, phase: 'Find', model: 'sonnet', schema: FINDINGS },
  )
))
const findings = perService.filter(Boolean).flatMap((r) => r.findings)
log(`found ${findings.length}`)

const verified = await pipeline(
  findings,
  (finding) => agent(
    `Finding: unpinned dependency ${finding.name}@${finding.range} at ${finding.file}:${finding.line}. Try to refute it. Confirmed only if the range is *, latest, or an open range (>=, ^, ~) with no lockfile pin overriding it; refuted if the version is exact or a lockfile pins it.`,
    { label: `verify:${finding.name}`, phase: 'Verify', model: 'sonnet', schema: VERDICT },
  ).then((verdict) => (verdict ? { ...finding, ...verdict } : null)),
  (v) => (v && v.confirmed ? v : null),
)
const confirmed = verified.filter(Boolean)
log(`confirmed ${confirmed.length}, refuted ${findings.length - confirmed.length}`)

phase('Report')
const report = await agent(
  `Write runs/dep-audit.md: a "# dep-audit" report grouping these confirmed findings by service (derive the service from the file path), one line each as "- <name> <range> — <file>:<line> — <reason>": ${JSON.stringify(confirmed)}. Reply with exactly the path runs/dep-audit.md and nothing else.`,
  { label: 'report', phase: 'Report', model: 'sonnet' },
)

// Top-level return is valid here: the workflow runtime wraps this body in an async function; a plain node --check will reject it.
return { found: findings.length, confirmed: confirmed.length, refuted: findings.length - confirmed.length, report }
