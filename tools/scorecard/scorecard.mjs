#!/usr/bin/env node
// Turns ledger rows into one table of what each workshop step cost.
//
// Usage:
//   npm run scorecard -- add "<step label>" --result "<what came back>" [--risk "<what could have gone wrong>"]
//   npm run scorecard                 # print runs/scorecard.md (regenerated from scorecard.json)
//   npm run scorecard -- reset        # archive scorecard.json to scorecard-<n>.json, start fresh
//
// Reads the ledger the same way tools/ledger/report.mjs does (LEDGER_DIR env override, for
// tests). `add` consumes every runs/token-ledger.jsonl row appended since the previous `add`
// (tracked as `last_consumed` in runs/scorecard.json) — do not edit that file by hand.

import fs from 'node:fs'
import path from 'node:path'

const runsDir = process.env.LEDGER_DIR || path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'runs')
const ledgerPath = path.join(runsDir, 'token-ledger.jsonl')
const scorecardPath = path.join(runsDir, 'scorecard.json')
const mdPath = path.join(runsDir, 'scorecard.md')

const [cmd, ...rest] = process.argv.slice(2)

if (!cmd) print()
else if (cmd === 'add') add(rest)
else if (cmd === 'reset') reset()
else {
  console.error(`unknown command: ${cmd}`)
  console.error('usage: scorecard [add "<step label>" --result "<what came back>" [--risk "<...>"] | reset]')
  process.exit(1)
}

function readLedgerRows() {
  if (!fs.existsSync(ledgerPath)) return []
  return fs
    .readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

function loadCard() {
  if (!fs.existsSync(scorecardPath)) return { last_consumed: 0, rows: [] }
  return JSON.parse(fs.readFileSync(scorecardPath, 'utf8'))
}

function saveCard(card) {
  fs.mkdirSync(runsDir, { recursive: true })
  fs.writeFileSync(scorecardPath, JSON.stringify(card, null, 2))
}

function parseAddArgs(argv) {
  if (argv.length === 0 || argv[0].startsWith('--')) {
    console.error('usage: scorecard add "<step label>" --result "<what came back>" [--risk "<what could have gone wrong>"]')
    process.exit(1)
  }
  const step = argv[0]
  const out = { step, result: '', risk: '' }
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--result') out.result = argv[++i] ?? ''
    else if (argv[i] === '--risk') out.risk = argv[++i] ?? ''
  }
  if (!out.result) {
    console.error('scorecard add: --result "<what came back>" is required')
    process.exit(1)
  }
  return out
}

function formatWall(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function add(argv) {
  const { step, result, risk } = parseAddArgs(argv)
  const rows = readLedgerRows()
  const card = loadCard()
  const newRows = rows.slice(card.last_consumed)

  if (newRows.length === 0) {
    console.log('no ledger rows since the last mark')
    return
  }

  const agents = newRows.filter((r) => r.scope === 'subagent').length
  const tokens = newRows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0)
  const est_usd = newRows.reduce((sum, r) => sum + (r.est_usd ?? 0), 0)
  const firstTs = new Date(newRows[0].ts).getTime()
  const lastTs = new Date(newRows[newRows.length - 1].ts).getTime()
  const wall = formatWall(lastTs - firstTs)

  card.rows.push({ step, result, risk, agents, tokens, est_usd, wall })
  card.last_consumed = rows.length
  saveCard(card)
  writeMarkdown(card)
  console.log(`added row ${card.rows.length}: ${step} — ${agents} agent(s), ${tokens.toLocaleString('en-US')} tokens, $${est_usd.toFixed(4)}, ${wall}`)
}

function reset() {
  if (!fs.existsSync(scorecardPath)) {
    console.log('no scorecard yet, nothing to reset')
    return
  }
  let n = 1
  while (fs.existsSync(path.join(runsDir, `scorecard-${n}.json`))) n += 1
  fs.renameSync(scorecardPath, path.join(runsDir, `scorecard-${n}.json`))
  if (fs.existsSync(mdPath)) fs.rmSync(mdPath)
  console.log(`archived to runs/scorecard-${n}.json`)
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function writeMarkdown(card) {
  const header = ['#', 'step', 'what came back', 'agents', 'tokens', 'est $', 'wall', 'what could have gone wrong']
  const body = card.rows.map((r, i) => [
    String(i + 1),
    r.step,
    r.result,
    String(r.agents),
    r.tokens.toLocaleString('en-US'),
    `$${r.est_usd.toFixed(4)}`,
    r.wall,
    r.risk || '',
  ])
  const totalAgents = card.rows.reduce((s, r) => s + r.agents, 0)
  const totalTokens = card.rows.reduce((s, r) => s + r.tokens, 0)
  const totalUsd = card.rows.reduce((s, r) => s + r.est_usd, 0)
  const totalRow = ['', 'TOTAL', '', String(totalAgents), totalTokens.toLocaleString('en-US'), `$${totalUsd.toFixed(4)}`, '', '']

  const lines = [
    `| ${header.map(escapeCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...[...body, totalRow].map((r) => `| ${r.map(escapeCell).join(' | ')} |`),
  ]

  fs.mkdirSync(runsDir, { recursive: true })
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n\nestimates from tools/ledger/prices.json\n`)
}

function print() {
  const card = loadCard()
  if (card.rows.length === 0) {
    console.log('No scorecard rows yet. Run: npm run scorecard -- add "<step>" --result "<what came back>"')
    return
  }
  writeMarkdown(card)
  console.log(fs.readFileSync(mdPath, 'utf8'))
}
