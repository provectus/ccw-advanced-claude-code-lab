#!/usr/bin/env node
// Prints the token ledger as a table. Usage: npm run tokens [-- --last N] [-- --json]

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const lastIdx = args.indexOf('--last')
const last = lastIdx >= 0 ? Number(args[lastIdx + 1]) : 0

const runsDir = process.env.LEDGER_DIR || path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'runs')
const ledgerPath = path.join(runsDir, 'token-ledger.jsonl')

if (!fs.existsSync(ledgerPath)) {
  console.log(`No ledger yet at ${path.relative(process.cwd(), ledgerPath)}. Spawn a sub-agent or finish a turn first.`)
  process.exit(0)
}

let rows = fs
  .readFileSync(ledgerPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l))
if (last > 0) rows = rows.slice(-last)

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}

const header = ['#', 'when', 'scope', 'agent', 'model', 'in', 'cache r', 'cache w', 'out', 'msgs', 'est $']
const table = rows.map((r, i) => [
  String(i + 1),
  (r.ts ?? '').slice(11, 19),
  r.scope,
  r.agent_type ?? (r.scope === 'session' ? 'main' : '?'),
  shortModel(r.model),
  fmt(r.input_tokens),
  fmt(r.cache_read_input_tokens),
  fmt(r.cache_creation_input_tokens),
  fmt(r.output_tokens),
  String(r.messages ?? ''),
  (r.est_usd ?? 0).toFixed(4) + (r.assumed ? '*' : ''),
])

const totals = rows.reduce(
  (t, r) => {
    t.in += r.input_tokens ?? 0
    t.cr += r.cache_read_input_tokens ?? 0
    t.cw += r.cache_creation_input_tokens ?? 0
    t.out += r.output_tokens ?? 0
    t.usd += r.est_usd ?? 0
    return t
  },
  { in: 0, cr: 0, cw: 0, out: 0, usd: 0 },
)
table.push(['', '', '', 'TOTAL', '', fmt(totals.in), fmt(totals.cr), fmt(totals.cw), fmt(totals.out), '', totals.usd.toFixed(4)])

printTable([header, ...table])

const subagents = rows.filter((r) => r.scope === 'subagent')
const models = [...new Set(rows.map((r) => shortModel(r.model)))]
console.log('')
console.log(`${rows.length} entries · ${subagents.length} sub-agents · models seen: ${models.join(', ')}`)
if (rows.some((r) => r.assumed)) console.log('* priced as the default family because the model was not recognised')
console.log('Prices: tools/ledger/prices.json (USD per million). Estimates, not your invoice.')

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-US')
}

function shortModel(m) {
  return String(m ?? '?').replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

function printTable(rowsToPrint) {
  const widths = rowsToPrint[0].map((_, c) => Math.max(...rowsToPrint.map((r) => String(r[c]).length)))
  const numeric = new Set([0, 5, 6, 7, 8, 9, 10])
  for (const [i, r] of rowsToPrint.entries()) {
    const line = r.map((cell, c) => (numeric.has(c) ? String(cell).padStart(widths[c]) : String(cell).padEnd(widths[c]))).join('  ')
    console.log(line)
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  }
}
