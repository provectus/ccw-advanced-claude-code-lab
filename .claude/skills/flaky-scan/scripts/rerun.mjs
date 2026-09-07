#!/usr/bin/env node
// Deterministic script for the flaky-scan skill (../SKILL.md). Reruns one service's Vitest
// suite N times and reports which tests failed in some runs but not all (flaky) versus every
// run (always failing). No LLM calls, no dependencies beyond Node's own child_process/fs/os.
// Exit code is always 0 — this reports, it doesn't gate.
//
// Usage: node rerun.mjs <service> [runs=3]

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..', '..', '..') // .claude/skills/flaky-scan/scripts -> repo root

/** Repo-relative, forward-slashed path, for stable output across platforms. */
export function toRepoRelative(absPath, repoRoot) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/')
}

/** Parses one Vitest --reporter=json payload into a flat [{file, name, passed}] list. */
export function extractResults(payload, repoRoot) {
  const out = []
  for (const suite of payload?.testResults ?? []) {
    const file = toRepoRelative(suite.name ?? '', repoRoot)
    for (const test of suite.assertionResults ?? []) {
      out.push({ file, name: test.fullName || test.title, passed: test.status === 'passed' })
    }
  }
  return out
}

/** Tallies pass/fail across N runs' worth of results into flaky vs. always-failing lists. */
export function summarize(runsResults) {
  const tally = new Map()
  for (const results of runsResults) {
    for (const { file, name, passed } of results) {
      const key = `${file} › ${name}`
      const entry = tally.get(key) ?? { file, name, failed: 0, total: 0 }
      entry.total += 1
      if (!passed) entry.failed += 1
      tally.set(key, entry)
    }
  }
  const flaky = []
  const alwaysFailing = []
  for (const entry of tally.values()) {
    if (entry.failed === 0) continue
    ;(entry.failed === entry.total ? alwaysFailing : flaky).push(entry)
  }
  return { flaky, alwaysFailing }
}

function runOnce(service) {
  const outFile = path.join(os.tmpdir(), `flaky-scan-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
  // A single pre-built command string with shell:true (rather than a shell:true + args array,
  // which Node warns is unescaped) — service and outFile are program-controlled, not user text.
  const cmd = `npx vitest run "${service}/" --reporter=json --outputFile="${outFile}"`
  spawnSync(cmd, { cwd: root, encoding: 'utf8', shell: true })
  if (!fs.existsSync(outFile)) return []
  let payload = null
  try {
    payload = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  } catch {
    payload = null
  } finally {
    fs.rmSync(outFile, { force: true })
  }
  return payload ? extractResults(payload, root) : []
}

function main() {
  const [service, runsArg] = process.argv.slice(2)
  if (!service) {
    console.log(JSON.stringify({ error: 'usage: rerun.mjs <service> [runs=3]' }))
    return
  }
  const runs = Math.max(1, Number(runsArg) || 3)

  const started = Date.now()
  const perRun = []
  for (let i = 0; i < runs; i += 1) perRun.push(runOnce(service))
  const { flaky, alwaysFailing } = summarize(perRun)
  const durationMs = Date.now() - started

  const toRow = (e) => ({ file: e.file, name: e.name, failed: e.failed, runs: e.total })
  console.log(
    JSON.stringify({
      service,
      runs,
      flaky: flaky.map(toRow),
      alwaysFailing: alwaysFailing.map(toRow),
      durationMs,
    }),
  )
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main()
