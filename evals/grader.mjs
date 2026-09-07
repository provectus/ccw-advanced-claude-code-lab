import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Grade a skill's output text against one task's expected findings and
 * forbidden patterns.
 *
 * A finding "matches" when every one of its patterns is found somewhere in
 * outputText (case-insensitive). Patterns are not required to appear on the
 * same line — the checklist's output contract puts severity, file, and
 * description on one line, but we don't demand exact column layout, just
 * that the finding was actually reported.
 *
 * @param {{id: string, expected: Array<{id: string, patterns: string[]}>, forbidden?: string[]}} task
 * @param {string} outputText
 * @returns {{task_id: string, pass: boolean, matched: string[], missed: string[], forbidden_hits: string[]}}
 */
export function grade(task, outputText) {
  const text = outputText ?? ''
  const matched = []
  const missed = []

  for (const finding of task.expected ?? []) {
    const allPatternsHit = (finding.patterns ?? []).every((pattern) => new RegExp(pattern, 'i').test(text))
    if (allPatternsHit) matched.push(finding.id)
    else missed.push(finding.id)
  }

  const forbidden_hits = (task.forbidden ?? []).filter((pattern) => new RegExp(pattern, 'i').test(text))
  const pass = missed.length === 0 && forbidden_hits.length === 0

  return { task_id: task.id, pass, matched, missed, forbidden_hits }
}

function loadTask(taskId) {
  const tasksFile = path.join(here, 'tasks', 'tasks.json')
  const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'))
  const task = tasks.find((t) => t.id === taskId)
  if (!task) throw new Error(`unknown task: ${taskId}`)
  return task
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const [taskId, outputFile] = process.argv.slice(2)
  if (!taskId || !outputFile) {
    console.error('usage: node evals/grader.mjs <task-id> <file-with-output>')
    process.exit(1)
  }
  const task = loadTask(taskId)
  const outputText = fs.readFileSync(outputFile, 'utf8')
  console.log(JSON.stringify(grade(task, outputText)))
}
