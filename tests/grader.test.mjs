import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { grade } from '../evals/grader.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tasks = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'tasks', 'tasks.json'), 'utf8'))
const outputsDir = path.join(root, 'evals', 'fixtures', 'outputs')
const runScript = path.join(root, 'evals', 'run.mjs')
const compareScript = path.join(root, 'evals', 'compare.mjs')
const fakeClaude = path.join(root, 'evals', 'fixtures', 'fake-claude.mjs')

function taskById(id) {
  const task = tasks.find((t) => t.id === id)
  assert.ok(task, `no task ${id} in tasks.json`)
  return task
}

function fixture(name) {
  return fs.readFileSync(path.join(outputsDir, name), 'utf8')
}

function freshDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('grade()', () => {
  it('passes task-01 (missing auth on the refund route)', () => {
    const result = grade(taskById('task-01'), fixture('task-01.md'))
    assert.equal(result.pass, true)
    assert.deepEqual(result.missed, [])
    assert.deepEqual(result.forbidden_hits, [])
  })

  it('passes task-02 (hardcoded secret)', () => {
    const result = grade(taskById('task-02'), fixture('task-02.md'))
    assert.equal(result.pass, true)
  })

  it('fails task-03 on the fixture that misses the PII finding', () => {
    const result = grade(taskById('task-03'), fixture('task-03.md'))
    assert.equal(result.pass, false)
    assert.ok(result.missed.includes('pii-in-logs'), `expected missed to include pii-in-logs, got ${result.missed}`)
    assert.deepEqual(result.forbidden_hits, [])
  })

  it('passes task-03 on the passing variant fixture', () => {
    const result = grade(taskById('task-03'), fixture('task-03.pass.md'))
    assert.equal(result.pass, true)
    assert.deepEqual(result.missed, [])
  })

  it('passes task-04 (clean rename, exact "No findings." reply)', () => {
    const result = grade(taskById('task-04'), fixture('task-04.md'))
    assert.equal(result.pass, true)
  })

  it('passes task-05 (unpinned dependency and disabled test)', () => {
    const result = grade(taskById('task-05'), fixture('task-05.md'))
    assert.equal(result.pass, true)
    assert.deepEqual(result.matched.sort(), ['disabled-test', 'unpinned-dependency'])
  })

  it('flags a forbidden-hit for task-04 when the reply mentions a severity word', () => {
    const result = grade(
      taskById('task-04'),
      'critical ledger/src/ledger.ts:49 — Auth on money-moving routes — false positive on a rename.',
    )
    assert.equal(result.pass, false)
    assert.ok(result.forbidden_hits.length > 0, 'expected at least one forbidden hit')
  })
})

describe('evals/run.mjs against the fake claude binary', () => {
  it('writes a results file with the expected pass-rate and total cost', () => {
    const resultsDir = freshDir('evals-results-')
    execFileSync(process.execPath, [runScript, '--label', 'fake-run'], {
      cwd: root,
      env: { ...process.env, CLAUDE_BIN: fakeClaude, EVALS_RESULTS_DIR: resultsDir },
      encoding: 'utf8',
    })

    const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json'))
    assert.equal(files.length, 1, `expected exactly one results file, got ${files}`)

    const payload = JSON.parse(fs.readFileSync(path.join(resultsDir, files[0]), 'utf8'))
    assert.equal(payload.label, 'fake-run')
    assert.equal(payload.tasks.length, 5)
    assert.equal(payload.pass_rate, 0.8, 'task-03 should fail against the fake claude output, the other four pass')
    assert.ok(
      Math.abs(payload.total_cost_usd - 0.0615) < 1e-6,
      `total_cost_usd ${payload.total_cost_usd} should be about 0.0615 (5 tasks * $0.0123)`,
    )

    const failing = payload.tasks.filter((t) => !t.pass)
    assert.deepEqual(
      failing.map((t) => t.task_id),
      ['task-03'],
    )
  })
})

describe('evals/compare.mjs', () => {
  it('prints a delta line comparing two results files', () => {
    const resultsDir = freshDir('evals-compare-')
    const a = {
      label: 'before',
      model: null,
      started_at: new Date(Date.now() - 60_000).toISOString(),
      tasks: tasks.map((t) => ({ task_id: t.id, pass: t.id !== 'task-05', matched: [], missed: [], forbidden_hits: [], total_cost_usd: 0.01, usage: {}, num_turns: 1, duration_ms: 500 })),
      pass_rate: 0.8,
      total_cost_usd: 0.05,
      total_tokens: 1000,
    }
    const b = {
      label: 'after',
      model: null,
      started_at: new Date().toISOString(),
      tasks: tasks.map((t) => ({ task_id: t.id, pass: true, matched: [], missed: [], forbidden_hits: [], total_cost_usd: 0.012, usage: {}, num_turns: 1, duration_ms: 500 })),
      pass_rate: 1,
      total_cost_usd: 0.06,
      total_tokens: 1100,
    }
    const aPath = path.join(resultsDir, 'a-before.json')
    const bPath = path.join(resultsDir, 'b-after.json')
    fs.writeFileSync(aPath, JSON.stringify(a))
    fs.writeFileSync(bPath, JSON.stringify(b))

    const out = execFileSync(process.execPath, [compareScript, aPath, bPath], { encoding: 'utf8' })
    assert.match(out, /pass-rate:.*delta/)
    assert.match(out, /total cost:.*delta/)
  })
})
