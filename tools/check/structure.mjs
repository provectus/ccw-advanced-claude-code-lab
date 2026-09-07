#!/usr/bin/env node
// Structure check for the workshop scaffolding. Exits non-zero with a list of problems.
//
// - .claude/** contains no TODO marker (hooks, agents, and skills there are finished/pre-wired)
// - every build-it/*.stub.md contains a TODO marker and has a finished counterpart under
//   .claude/ (agents/<name>.md or skills/<name>/SKILL.md) that is byte-identical to the
//   same file under solutions/.claude/
// - every other skill under .claude/skills/ (a skill folder may contain a scripts/ subfolder)
//   is byte-identical, file for file, to its solutions/.claude/skills/ counterpart — except
//   skills on the INTENTIONALLY_DIVERGENT list, which are allowed (expected) to differ
// - front matter of each stub and its .claude/ counterpart parses and carries required fields
// - every hook script under .claude/hooks/ parses and is wired in .claude/settings.json itself
// - .claude/settings.json and solutions/.claude/settings.json both parse and carry the cost
//   guard, and both wire the ledger hook on SubagentStop/Stop

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const claudeRoot = path.join(root, '.claude')
const buildItRoot = path.join(root, 'build-it')
const solRoot = path.join(root, 'solutions', '.claude')
const problems = []

const REQUIRED = {
  agent: ['name', 'description', 'tools', 'model'],
  skill: ['name', 'description'],
}

// Skills that are deliberately NOT byte-identical to their solution (the eval gap is the point).
const INTENTIONALLY_DIVERGENT_SKILLS = ['money-movement-checklist']

// 1. No TODO anywhere under .claude/** — it's finished and pre-wired, not a stub.
for (const file of walk(claudeRoot)) {
  if (!/\.(md|mjs|json)$/.test(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  if (/\bTODO\b/.test(text)) problems.push(`${path.relative(root, file)}: .claude/** must contain no TODO`)
}

// 2. Each build-it stub has a TODO and a byte-identical finished counterpart in both
//    .claude/ and solutions/.claude/.
const buildItCounterparts = new Set()
if (fs.existsSync(buildItRoot)) {
  for (const file of fs.readdirSync(buildItRoot)) {
    if (!file.endsWith('.stub.md')) continue
    const stubPath = path.join(buildItRoot, file)
    const stubText = fs.readFileSync(stubPath, 'utf8')
    if (!/\bTODO\b/.test(stubText)) problems.push(`build-it/${file}: stub has no TODO marker (is it already the solution?)`)

    const counterpart = counterpartFor(file)
    if (!counterpart) {
      problems.push(`build-it/${file}: doesn't match the <name>.stub.md or <name>.SKILL.stub.md naming convention`)
      continue
    }
    buildItCounterparts.add(counterpart)

    const finishedPath = path.join(claudeRoot, counterpart)
    const solPath = path.join(solRoot, counterpart)
    if (!fs.existsSync(finishedPath)) {
      problems.push(`build-it/${file}: no finished counterpart at .claude/${toPosix(counterpart)}`)
      continue
    }
    if (!fs.existsSync(solPath)) {
      problems.push(`build-it/${file}: no solution at solutions/.claude/${toPosix(counterpart)}`)
      continue
    }

    const finishedText = fs.readFileSync(finishedPath, 'utf8')
    const solText = fs.readFileSync(solPath, 'utf8')
    if (finishedText !== solText) {
      problems.push(`.claude/${toPosix(counterpart)}: not byte-identical to solutions/.claude/${toPosix(counterpart)}`)
    }

    const kind = counterpart.startsWith('agents' + path.sep) ? 'agent' : 'skill'
    for (const [label, text] of [[`build-it/${file}`, stubText], [`.claude/${toPosix(counterpart)}`, finishedText]]) {
      const fm = frontMatter(text)
      if (!fm) {
        problems.push(`${label}: missing front matter`)
        continue
      }
      for (const field of REQUIRED[kind]) if (!(field in fm)) problems.push(`${label}: front matter lacks '${field}'`)
    }
  }
}

// 2b. Every other skill (finished directly in .claude/, no build-it stub) must be
//     byte-identical, file for file — including a scripts/ subfolder — to its
//     solutions/.claude/skills/ counterpart, unless it's on the divergent list.
const skillsDir = path.join(claudeRoot, 'skills')
if (fs.existsSync(skillsDir)) {
  for (const name of fs.readdirSync(skillsDir)) {
    const skillRel = path.join('skills', name)
    if (buildItCounterparts.has(path.join(skillRel, 'SKILL.md'))) continue // already checked above
    if (INTENTIONALLY_DIVERGENT_SKILLS.includes(name)) continue

    const claudeDir = path.join(claudeRoot, skillRel)
    const solDir = path.join(solRoot, skillRel)
    if (!fs.statSync(claudeDir).isDirectory()) continue
    if (!fs.existsSync(solDir)) {
      problems.push(`.claude/${toPosix(skillRel)}: no solution at solutions/.claude/${toPosix(skillRel)}`)
      continue
    }
    for (const problem of diffDirs(claudeDir, solDir, `.claude/${toPosix(skillRel)}`, `solutions/.claude/${toPosix(skillRel)}`)) {
      problems.push(problem)
    }
  }
}

// 3. Hooks: parse, and be wired in .claude/settings.json.
const hooksDir = path.join(claudeRoot, 'hooks')
const stubSettings = readJson(path.join(claudeRoot, 'settings.json'), '.claude/settings.json')
const solSettings = readJson(path.join(solRoot, 'settings.json'), 'solutions/.claude/settings.json')
if (fs.existsSync(hooksDir)) {
  for (const file of fs.readdirSync(hooksDir).filter((f) => f.endsWith('.mjs'))) {
    try {
      execFileSync(process.execPath, ['--check', path.join(hooksDir, file)], { stdio: 'pipe' })
    } catch (err) {
      problems.push(`.claude/hooks/${file}: does not parse (${String(err.stderr || err.message).trim().split('\n')[0]})`)
    }
    if (stubSettings && !JSON.stringify(stubSettings).includes(`.claude/hooks/${file}`)) {
      problems.push(`.claude/hooks/${file}: not wired in .claude/settings.json`)
    }
  }
}

for (const [label, s] of [['.claude/settings.json', stubSettings], ['solutions/.claude/settings.json', solSettings]]) {
  if (!s) continue
  if (s.workflowSizeGuideline !== 'small') problems.push(`${label}: workflowSizeGuideline must be 'small' for the workshop`)
  for (const event of ['SubagentStop', 'Stop']) {
    if (!JSON.stringify(s.hooks?.[event] ?? []).includes('tools/ledger/hook.mjs')) problems.push(`${label}: ${event} is not wired to the ledger hook`)
  }
}

if (problems.length) {
  console.error(`structure check: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('structure check: OK')

// `verifier.stub.md` -> agents/verifier.md
// `dep-audit.SKILL.stub.md` -> skills/dep-audit/SKILL.md
function counterpartFor(stubFile) {
  if (stubFile.endsWith('.SKILL.stub.md')) {
    const name = stubFile.slice(0, -'.SKILL.stub.md'.length)
    return path.join('skills', name, 'SKILL.md')
  }
  if (stubFile.endsWith('.stub.md')) {
    const name = stubFile.slice(0, -'.stub.md'.length)
    return path.join('agents', `${name}.md`)
  }
  return null
}

function toPosix(p) {
  return p.split(path.sep).join('/')
}

/** Recursively diffs two directories file-by-file; returns a list of problem strings. */
function diffDirs(dirA, dirB, labelA, labelB) {
  const problems = []
  const filesA = new Set(walk(dirA).map((f) => path.relative(dirA, f)))
  const filesB = new Set(walk(dirB).map((f) => path.relative(dirB, f)))
  for (const rel of filesA) {
    if (!filesB.has(rel)) {
      problems.push(`${labelA}/${toPosix(rel)}: no counterpart at ${labelB}/${toPosix(rel)}`)
      continue
    }
    const a = fs.readFileSync(path.join(dirA, rel))
    const b = fs.readFileSync(path.join(dirB, rel))
    if (!a.equals(b)) problems.push(`${labelA}/${toPosix(rel)}: not byte-identical to ${labelB}/${toPosix(rel)}`)
  }
  for (const rel of filesB) {
    if (!filesA.has(rel)) problems.push(`${labelB}/${toPosix(rel)}: no counterpart at ${labelA}/${toPosix(rel)}`)
  }
  return problems
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2]
  }
  return fm
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    problems.push(`${label}: ${fs.existsSync(file) ? 'invalid JSON' : 'missing'}`)
    return null
  }
}
