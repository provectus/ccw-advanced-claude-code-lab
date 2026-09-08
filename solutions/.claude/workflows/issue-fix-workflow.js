// Saved dynamic workflow for the issue-fix ladder (ladder B, rung 4). Press `s` after a
// /workflows run to save a script like this one; `/issue-fix-workflow` (or
// Workflow({name: 'issue-fix-workflow'})) reruns it. Named distinctly from `/issue-fix` because
// the rung-3 skill already owns that command in the same session.
// args: { services: ['payments', 'kyc', 'ledger'] } — defaults to all three services.

export const meta = { name: 'issue-fix-workflow', description: 'One writer per service, verify each fix against its issue, report', phases: [{ title: 'Fix' }, { title: 'Verify' }, { title: 'Report' }] }

const ISSUES = {
  payments: 'issues/payments-duplicate-payouts.md',
  kyc: 'issues/kyc-status-leak.md',
  ledger: 'issues/ledger-idempotency-conflict.md',
}

const CHANGES = { type: 'object', properties: { changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' }, change: { type: 'string' } }, required: ['file', 'line', 'change'] } } }, required: ['changes'] }
const VERDICT = { type: 'object', properties: { holds: { type: 'boolean' }, passed: { type: 'number' }, total: { type: 'number' }, reason: { type: 'string' } }, required: ['holds', 'passed', 'total', 'reason'] }

const services = (args?.services ?? Object.keys(ISSUES)).filter((s) => ISSUES[s])

phase('Fix')
const fixes = await parallel(services.map((service) => () =>
  agent(
    `Resolve ${ISSUES[service]}. Read the issue, then ${service}/src and ${service}/tests. Edit only files under ${service}/. Meet every numbered acceptance criterion, including the tests it asks for. Run \`npm test -w ${service}\` and stop when it passes. Report one entry per changed hunk: file, line, and what changed. No transcript.`,
    { label: `fix:${service}`, phase: 'Fix', model: 'sonnet', schema: CHANGES },
  ).then((r) => ({ service, changes: r?.changes ?? [] })),
))
log(`fixed ${fixes.filter((f) => f.changes.length > 0).length}`)

const verified = await pipeline(
  fixes,
  (fix) => agent(
    `You are a fix verifier. Issue: ${ISSUES[fix.service]}. Service: ${fix.service}/. Read the issue and turn EVERY numbered acceptance criterion into one concrete check derived from the issue text, not from the diff — the "different body" and "no money moved" cases are where fixes fall short. Write one script at runs/verify/${fix.service}.ts that imports the service's createApp (relative path), starts it on port 0, runs each check with node:assert/strict, and prints ok <n> or fail <n> — <reason> per criterion; run it with \`npx tsx runs/verify/${fix.service}.ts\`. Never edit anything under payments/, kyc/ or ledger/. Report holds (true only if every check passed), passed, total, and a reason naming the lowest-numbered failing criterion (or "all criteria hold").`,
    { label: `verify:${fix.service}`, phase: 'Verify', model: 'sonnet', schema: VERDICT },
  ).then((verdict) => ({ ...fix, ...(verdict ?? { holds: false, passed: 0, total: 0, reason: 'verifier returned nothing' }) })),
  (v) => v,
)
const holds = verified.filter((v) => v.holds).length
log(`holds ${holds}, fails ${verified.length - holds}`)

phase('Report')
const summary = `fixed ${fixes.filter((f) => f.changes.length > 0).length}, holds ${holds}, fails ${verified.length - holds}`
await agent(
  `Write runs/issue-fix.md: a "# issue-fix" report with one "## <service>" section per entry in ${JSON.stringify(verified)} — a "verdict:" line (holds or fails, then the reason) and a "changes:" list of "<file>:<line> — <change>" — then a "## Summary" section containing exactly: ${summary}. Reply with exactly the path runs/issue-fix.md and nothing else.`,
  { label: 'report', phase: 'Report', model: 'sonnet' },
)

// Top-level return is valid here: the workflow runtime wraps this body in an async function; a plain node --check will reject it.
return { summary, fixed: fixes.filter((f) => f.changes.length > 0).length, holds, fails: verified.length - holds }
