#!/usr/bin/env node
// Stand-in for the `claude` headless binary, used by tests so no tokens are
// spent. Finds which task the prompt is about by matching the diff's first
// `+++ b/<path>` line (embedded verbatim in the prompt by evals/run.mjs),
// then answers with the canned output fixture for that task.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tasksDir = path.join(here, '..', 'tasks')
const outputsDir = path.join(here, 'outputs')

const argv = process.argv.slice(2)
const promptIndex = argv.indexOf('-p')
const prompt = promptIndex >= 0 ? argv[promptIndex + 1] ?? '' : ''

function findTaskId(promptText) {
  const diffFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.diff'))
  for (const file of diffFiles) {
    const diffText = fs.readFileSync(path.join(tasksDir, file), 'utf8')
    const marker = diffText.match(/^\+\+\+ b\/.+$/m)?.[0]
    if (marker && promptText.includes(marker)) return file.replace(/\.diff$/, '')
  }
  return null
}

const taskId = findTaskId(prompt)
const outputPath = taskId ? path.join(outputsDir, `${taskId}.md`) : null
const result = outputPath && fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : 'No findings.'

const payload = {
  result,
  total_cost_usd: 0.0123,
  usage: { input_tokens: 1200, output_tokens: 80 },
  num_turns: 1,
  duration_ms: 900,
}

process.stdout.write(JSON.stringify(payload))
