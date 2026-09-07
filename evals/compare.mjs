#!/usr/bin/env node
// Prints two eval results files side by side: per-task pass/fail and cost,
// then the pass-rate and total-cost deltas. With no args, compares the two
// most recent files in EVALS_RESULTS_DIR (default evals/results).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const resultsDir = process.env.EVALS_RESULTS_DIR || path.join(here, 'results')

function twoMostRecent() {
  if (!fs.existsSync(resultsDir)) throw new Error(`no results directory at ${resultsDir}`)
  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, mtime: fs.statSync(path.join(resultsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (files.length < 2) throw new Error('need at least two results files to compare')
  // [older, newer] so the delta reads "before -> after"
  return [files[1].file, files[0].file].map((f) => path.join(resultsDir, f))
}

function resolvePaths(argv) {
  if (argv.length >= 2) return [argv[0], argv[1]]
  return twoMostRecent()
}

function fmtUsd(n) {
  return `$${(n || 0).toFixed(4)}`
}

function main() {
  const [aPath, bPath] = resolvePaths(process.argv.slice(2))
  const a = JSON.parse(fs.readFileSync(aPath, 'utf8'))
  const b = JSON.parse(fs.readFileSync(bPath, 'utf8'))

  console.log(`a: ${a.label} (${path.basename(aPath)})`)
  console.log(`b: ${b.label} (${path.basename(bPath)})`)
  console.log('')

  const ids = [...new Set([...(a.tasks ?? []).map((t) => t.task_id), ...(b.tasks ?? []).map((t) => t.task_id)])].sort()
  console.log('task      a.pass  b.pass  a.cost    b.cost')
  for (const id of ids) {
    const ta = (a.tasks ?? []).find((t) => t.task_id === id)
    const tb = (b.tasks ?? []).find((t) => t.task_id === id)
    const pa = ta ? (ta.pass ? 'pass' : 'fail') : '-'
    const pb = tb ? (tb.pass ? 'pass' : 'fail') : '-'
    const ca = ta ? fmtUsd(ta.total_cost_usd) : '-'
    const cb = tb ? fmtUsd(tb.total_cost_usd) : '-'
    console.log(`${id.padEnd(10)}${pa.padEnd(8)}${pb.padEnd(8)}${ca.padEnd(10)}${cb}`)
  }

  console.log('')
  const rateDelta = (b.pass_rate ?? 0) - (a.pass_rate ?? 0)
  const costDelta = (b.total_cost_usd ?? 0) - (a.total_cost_usd ?? 0)
  const sign = (n) => (n >= 0 ? '+' : '')
  console.log(`pass-rate: ${a.pass_rate} -> ${b.pass_rate}  (delta ${sign(rateDelta)}${rateDelta.toFixed(2)})`)
  console.log(`total cost: ${fmtUsd(a.total_cost_usd)} -> ${fmtUsd(b.total_cost_usd)}  (delta ${sign(costDelta)}${costDelta.toFixed(4)})`)
}

main()
