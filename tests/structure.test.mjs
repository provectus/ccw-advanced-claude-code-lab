import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const check = path.join(root, 'tools', 'check', 'structure.mjs')

function copyRepo() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-'))
  fs.cpSync(path.join(root, '.claude'), path.join(copy, '.claude'), { recursive: true })
  fs.cpSync(path.join(root, 'build-it'), path.join(copy, 'build-it'), { recursive: true })
  fs.cpSync(path.join(root, 'solutions'), path.join(copy, 'solutions'), { recursive: true })
  return copy
}

describe('structure check', () => {
  it('passes on the repo as shipped', () => {
    const out = execFileSync(process.execPath, [check, root], { encoding: 'utf8' })
    assert.match(out, /OK/)
  })

  it('fails when a finished file under .claude/ still contains a TODO', () => {
    const copy = copyRepo()
    const agent = path.join(copy, '.claude', 'agents', 'verifier.md')
    fs.appendFileSync(agent, '\nTODO: finish this\n')
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /\.claude\/\*\* must contain no TODO/)
  })

  it('fails when a build-it stub has no TODO marker', () => {
    const copy = copyRepo()
    const stub = path.join(copy, 'build-it', 'verifier.stub.md')
    fs.writeFileSync(stub, fs.readFileSync(stub, 'utf8').replace(/TODO/g, 'DONE'))
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /stub has no TODO marker/)
  })

  it('fails when a finished .claude/ file drifts from its solution', () => {
    const copy = copyRepo()
    const finished = path.join(copy, '.claude', 'skills', 'dep-audit', 'SKILL.md')
    fs.appendFileSync(finished, '\n<!-- drift -->\n')
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /not byte-identical/)
  })

  it('fails when a non-build-it skill script drifts from its solution', () => {
    const copy = copyRepo()
    const script = path.join(copy, '.claude', 'skills', 'flaky-scan', 'scripts', 'rerun.mjs')
    fs.appendFileSync(script, '\n// drift\n')
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /flaky-scan\/scripts\/rerun\.mjs: not byte-identical/)
  })

  it('fails when a non-build-it skill is missing its solution counterpart', () => {
    const copy = copyRepo()
    fs.rmSync(path.join(copy, 'solutions', '.claude', 'skills', 'money-movement-conventions'), { recursive: true, force: true })
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /money-movement-conventions: no solution at solutions/)
  })

  it('lets the intentionally-weak money-movement-checklist skill diverge from its solution', () => {
    const copy = copyRepo()
    const shipped = path.join(copy, '.claude', 'skills', 'money-movement-checklist', 'SKILL.md')
    assert.notEqual(
      fs.readFileSync(shipped, 'utf8'),
      fs.readFileSync(path.join(copy, 'solutions', '.claude', 'skills', 'money-movement-checklist', 'SKILL.md'), 'utf8'),
      'fixture assumption: the shipped and solution checklists already differ',
    )
    const out = execFileSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.match(out, /OK/)
  })

  it('fails when the ledger hook is unwired', () => {
    const copy = copyRepo()
    const settingsPath = path.join(copy, '.claude', 'settings.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    delete settings.hooks.Stop
    fs.writeFileSync(settingsPath, JSON.stringify(settings))
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /Stop is not wired/)
  })

  it('fails when a hook is no longer wired in .claude/settings.json', () => {
    const copy = copyRepo()
    const settingsPath = path.join(copy, '.claude', 'settings.json')
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((h) => h.matcher !== 'Bash')
    fs.writeFileSync(settingsPath, JSON.stringify(settings))
    const res = spawnSync(process.execPath, [check, copy], { encoding: 'utf8' })
    assert.notEqual(res.status, 0)
    assert.match(res.stderr, /trim-test-output\.mjs: not wired in \.claude\/settings\.json/)
  })
})
