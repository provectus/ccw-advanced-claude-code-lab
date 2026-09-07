#!/usr/bin/env node
// Runs the money-movement-checklist skill headless against each labelled
// diff in evals/tasks/tasks.json, grades the reply, and writes one results
// file per run. See evals/README.md.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { grade } from './grader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const tasksDir = path.join(here, 'tasks')

function parseArgs(argv) {
  const args = { label: 'run', model: undefined, task: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--label') args.label = argv[++i]
    else if (argv[i] === '--model') args.model = argv[++i]
    else if (argv[i] === '--task') args.task = argv[++i]
  }
  return args
}

// Turns regex fragments in a finding's patterns into a short, readable hint
// ("card, cvv") — skips severity words and file-path patterns, which aren't
// the sentence an attendee needs to go fix.
function wordsFromPatterns(patterns) {
  const words = new Set()
  for (const pattern of patterns ?? []) {
    if (/^(critical|high|medium)$/i.test(pattern)) continue
    if (pattern.includes('/')) continue
    for (const word of pattern.replace(/[()^$\\]/g, '').split('|')) {
      const w = word.trim()
      if (w) words.add(w.toLowerCase())
    }
  }
  return [...words].join(', ')
}

// Prints what an attendee needs to know to fix a failing task: which findings
// the skill missed (in plain words, with a hint of the words it needed to
// say) and which forbidden patterns it hit anyway.
function printFailureDetail(task, result) {
  for (const missedId of result.missed ?? []) {
    const finding = (task.expected ?? []).find((f) => f.id === missedId)
    if (!finding) continue
    const hint = wordsFromPatterns(finding.patterns)
    console.log(`  missed: ${finding.description}${hint ? ` (expected words like: ${hint})` : ''}`)
  }
  for (const hit of result.forbidden_hits ?? []) {
    console.log(`  forbidden: matched /${hit}/ but shouldn't have appeared`)
  }
}

// The `claude` binary may be a real executable, or (in tests) a script path
// via CLAUDE_BIN. Windows cannot exec a .mjs/.js file directly, so route
// script paths through the current Node executable.
function runCli(bin, cliArgs) {
  return new Promise((resolve) => {
    const isScript = /\.(mjs|js)$/i.test(bin)
    const command = isScript ? process.execPath : bin
    const finalArgs = isScript ? [bin, ...cliArgs] : cliArgs
    execFile(command, finalArgs, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

async function main() {
  const { label, model, task: onlyTaskId } = parseArgs(process.argv.slice(2))
  const tasks = JSON.parse(fs.readFileSync(path.join(tasksDir, 'tasks.json'), 'utf8'))
  const selected = onlyTaskId ? tasks.filter((t) => t.id === onlyTaskId) : tasks
  if (selected.length === 0) {
    console.error(`no matching task for --task ${onlyTaskId}`)
    process.exit(1)
  }

  const bin = process.env.CLAUDE_BIN || 'claude'
  const budget = process.env.EVALS_BUDGET_USD || '1'

  const results = []
  let anySucceeded = false

  for (const task of selected) {
    const diff = fs.readFileSync(path.join(tasksDir, task.diff), 'utf8')
    const prompt = `Use the money-movement-checklist skill to review this diff. Reply using the skill's output contract only.\n\n${diff}`
    const cliArgs = ['-p', prompt, '--output-format', 'json', '--max-budget-usd', String(budget)]
    if (model) cliArgs.push('--model', model)

    const { err, stdout, stderr } = await runCli(bin, cliArgs)

    if (err) {
      console.error(`${task.id}  ERROR  ${err.message || stderr}`)
      const row = {
        task_id: task.id,
        pass: false,
        matched: [],
        missed: (task.expected ?? []).map((f) => f.id),
        forbidden_hits: [],
        total_cost_usd: 0,
        usage: {},
        num_turns: 0,
        duration_ms: 0,
      }
      results.push(row)
      printFailureDetail(task, row)
      continue
    }

    anySucceeded = true
    let parsed = {}
    try {
      parsed = JSON.parse(stdout)
    } catch {
      parsed = { result: stdout }
    }

    const graded = grade(task, parsed.result ?? '')
    const row = {
      ...graded,
      total_cost_usd: parsed.total_cost_usd ?? 0,
      usage: parsed.usage ?? {},
      num_turns: parsed.num_turns ?? 0,
      duration_ms: parsed.duration_ms ?? 0,
    }
    results.push(row)
    console.log(`${task.id}  ${graded.pass ? 'PASS' : 'FAIL'}  $${(row.total_cost_usd || 0).toFixed(4)}`)
    if (!graded.pass) printFailureDetail(task, row)
  }

  const passCount = results.filter((r) => r.pass).length
  const pass_rate = results.length ? passCount / results.length : 0
  const total_cost_usd = results.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0)
  const total_tokens = results.reduce(
    (sum, r) => sum + (r.usage?.input_tokens || 0) + (r.usage?.output_tokens || 0),
    0,
  )

  const resultsDir = process.env.EVALS_RESULTS_DIR || path.join(here, 'results')
  fs.mkdirSync(resultsDir, { recursive: true })
  const started_at = new Date().toISOString()
  const fileStamp = started_at.replace(/[:.]/g, '-')
  const outFile = path.join(resultsDir, `${fileStamp}-${label}.json`)
  fs.writeFileSync(
    outFile,
    JSON.stringify({ label, model: model || null, started_at, tasks: results, pass_rate, total_cost_usd, total_tokens }, null, 2),
  )

  console.log(`pass ${passCount}/${results.length} · $${total_cost_usd.toFixed(4)} · ${total_tokens} tokens`)

  if (!anySucceeded) process.exit(1)
}

main()
