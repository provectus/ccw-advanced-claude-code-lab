import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dedupe = path.join(root, 'tools', 'ledger', 'dedupe.mjs')
const fixtures = path.join(root, 'tests', 'fixtures', 'transcripts')

function freshDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeLedger(dir, rows) {
  const file = path.join(dir, 'token-ledger.jsonl')
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return file
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

function runDedupe(ledgerFile, projectsRoot, projectDirName) {
  const outPath = ledgerFile.replace(/\.jsonl$/, '') + '.fixed.jsonl'
  const stdout = execFileSync(
    process.execPath,
    [dedupe, ledgerFile, '--out', outPath, '--projects-root', projectsRoot, '--project-dir', projectDirName],
    { encoding: 'utf8' },
  )
  return { stdout, rows: readJsonl(outPath) }
}

describe('dedupe.mjs locateAgentTranscript', () => {
  it('finds nested workflow transcripts, flat transcripts, and keeps-but-flags rows it cannot locate', () => {
    const ledgerDir = freshDir('dedupe-ledger-')
    const projectsRoot = freshDir('dedupe-projects-')
    const projectDirName = 'proj-test'
    const projectDir = path.join(projectsRoot, projectDirName)

    // --- nested layout: subagents/workflows/<workflow-id>/agent-<id>.jsonl, no flat file ---
    const nestedSession = 'sess-nested'
    const nestedDir = path.join(projectDir, nestedSession, 'subagents', 'workflows', 'wf_test-1')
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.copyFileSync(
      path.join(fixtures, 'subagents', 'workflows', 'wf_test-1', 'agent-workflow-real.jsonl'),
      path.join(nestedDir, 'agent-workflow-real.jsonl'),
    )
    fs.copyFileSync(
      path.join(fixtures, 'subagents', 'workflows', 'wf_test-1', 'agent-workflow-real.meta.json'),
      path.join(nestedDir, 'agent-workflow-real.meta.json'),
    )
    // The real transcript sums to total_tokens=456, output_tokens=450, est_usd=0.004512 (see
    // tests/fixtures/transcripts/subagents/workflows/wf_test-1/agent-workflow-real.jsonl).
    // This row already has those exact numbers, mimicking what the already-fixed hook.mjs
    // writes today — dedupe should find it via the nested search and leave it UNCHANGED,
    // while still filling in agent_type from the sidecar meta file.
    const nestedRow = {
      ts: '2026-09-07T09:10:03.000Z',
      event: 'SubagentStop',
      scope: 'subagent',
      agent_id: 'workflow-real',
      agent_type: null,
      session_id: nestedSession,
      model: 'claude-sonnet-5',
      messages: 2,
      input_tokens: 6,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 450,
      thinking_tokens: 0,
      total_tokens: 456,
      est_usd: 0.004512,
      assumed: false,
    }

    // --- flat layout: subagents/agent-<id>.jsonl ---
    const flatSession = 'sess-flat'
    const flatDir = path.join(projectDir, flatSession, 'subagents')
    fs.mkdirSync(flatDir, { recursive: true })
    fs.copyFileSync(path.join(fixtures, 'subagents', 'agent-real-explore.jsonl'), path.join(flatDir, 'agent-real-explore.jsonl'))
    // Real transcript sums to total_tokens=2338, output_tokens=130. This row instead has the
    // classic misattribution fingerprint (huge numbers copied from an ever-growing parent
    // transcript) — dedupe should find the flat transcript and CORRECT the row.
    const flatRow = {
      ts: '2026-09-07T09:00:09.000Z',
      event: 'SubagentStop',
      scope: 'subagent',
      agent_id: 'real-explore',
      agent_type: null,
      session_id: flatSession,
      model: 'claude-sonnet-5',
      messages: 9,
      input_tokens: 400,
      cache_creation_input_tokens: 9000,
      cache_read_input_tokens: 9000,
      output_tokens: 9000,
      thinking_tokens: 900,
      total_tokens: 27400,
      est_usd: 0.27,
      assumed: false,
    }

    // --- not found anywhere: no subagents/ dir at all for this session ---
    const ghostRow = {
      ts: '2026-09-07T09:20:00.000Z',
      event: 'SubagentStop',
      scope: 'subagent',
      agent_id: 'never-written',
      agent_type: null,
      session_id: 'sess-ghost',
      model: 'claude-sonnet-5',
      messages: 3,
      input_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 700,
      thinking_tokens: 0,
      total_tokens: 750,
      est_usd: 0.02,
      assumed: false,
    }

    const sessionRow = { ts: '2026-09-07T09:21:00.000Z', event: 'Stop', scope: 'session', session_id: 'sess-flat', model: 'claude-sonnet-5', output_tokens: 1, total_tokens: 1, est_usd: 0.00001 }

    const ledgerFile = writeLedger(ledgerDir, [nestedRow, flatRow, ghostRow, sessionRow])
    const { stdout, rows } = runDedupe(ledgerFile, projectsRoot, projectDirName)

    assert.match(stdout, /corrected 1, unverified 1, unchanged 1/)
    assert.equal(rows.length, 4, 'no row is ever dropped, only corrected, left unchanged, or flagged unverified')

    const nestedOut = rows.find((r) => r.agent_id === 'workflow-real')
    assert.equal(nestedOut.total_tokens, 456, 'nested lookup found the real transcript')
    assert.equal(nestedOut.output_tokens, 450)
    assert.equal(nestedOut.agent_type, 'workflow-subagent', 'agent_type filled in from the sidecar meta file even though unchanged')
    assert.equal(nestedOut.unverified, undefined, 'a found-and-matching row is not marked unverified')

    const flatOut = rows.find((r) => r.agent_id === 'real-explore')
    assert.equal(flatOut.total_tokens, 2338, 'flat lookup found the real transcript and corrected the misattributed totals')
    assert.equal(flatOut.output_tokens, 130)
    assert.ok(Math.abs(flatOut.est_usd - 0.004516) < 1e-6)
    assert.equal(flatOut.unverified, undefined)

    const ghostOut = rows.find((r) => r.agent_id === 'never-written')
    assert.equal(ghostOut.unverified, true, 'a row with no transcript anywhere is kept, not dropped, and flagged unverified')
    assert.equal(ghostOut.total_tokens, 750, 'the original (unverifiable) numbers are preserved rather than zeroed or guessed')

    const sessionOut = rows.find((r) => r.scope === 'session')
    assert.deepEqual(sessionOut, sessionRow, 'session-scoped rows pass through untouched')
  })

  it("corrects a row whose own recorded transcript field disagrees with the file actually found, even if the numbers happen to match", () => {
    // A same-file race (two rows resolving to the identical parent transcript at nearly the
    // same moment — see hook.mjs's dedupe-key comment) could in principle produce numbers
    // that coincidentally match the real per-agent file. The row's own `transcript` field
    // (recorded by the concurrency-fixed hook.mjs) is an exact, non-numeric signal dedupe
    // should trust over a numeric coincidence.
    const ledgerDir = freshDir('dedupe-ledger-')
    const projectsRoot = freshDir('dedupe-projects-')
    const projectDirName = 'proj-mismatch'
    const session = 'sess-mismatch'
    const dir = path.join(projectsRoot, projectDirName, session, 'subagents')
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(path.join(fixtures, 'subagents', 'agent-real-explore.jsonl'), path.join(dir, 'agent-real-explore.jsonl'))
    // Numbers match the real file (total_tokens=2338, output_tokens=130, est_usd≈0.004516 —
    // see the flat-lookup case above) but `transcript` names a different file entirely.
    const row = {
      scope: 'subagent',
      agent_id: 'real-explore',
      session_id: session,
      agent_type: null,
      transcript: path.join(projectsRoot, 'some-other-parent-session.jsonl'),
      total_tokens: 2338,
      output_tokens: 130,
      est_usd: 0.004516,
    }
    const ledgerFile = writeLedger(ledgerDir, [row])
    const { stdout, rows } = runDedupe(ledgerFile, projectsRoot, projectDirName)

    assert.match(stdout, /corrected 1, unverified 0, unchanged 0/)
    assert.equal(rows[0].transcript, path.resolve(path.join(dir, 'agent-real-explore.jsonl')), 'transcript field corrected to the file actually found')
  })

  it('flags a row as unverified (not dropped) when the found transcript has no assistant messages to parse', () => {
    const ledgerDir = freshDir('dedupe-ledger-')
    const projectsRoot = freshDir('dedupe-projects-')
    const projectDirName = 'proj-empty'
    const session = 'sess-empty'
    const dir = path.join(projectsRoot, projectDirName, session, 'subagents')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'agent-empty-1.jsonl'), '') // exists, but nothing to parse

    const row = { scope: 'subagent', agent_id: 'empty-1', session_id: session, agent_type: null, total_tokens: 10, output_tokens: 5, est_usd: 0.001 }
    const ledgerFile = writeLedger(ledgerDir, [row])
    const { stdout, rows } = runDedupe(ledgerFile, projectsRoot, projectDirName)

    assert.match(stdout, /corrected 0, unverified 1, unchanged 0/)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].unverified, true)
    assert.equal(rows[0].total_tokens, 10, 'original numbers preserved')
  })
})
