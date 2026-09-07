import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = path.join(root, 'tools', 'ledger', 'hook.mjs')
const report = path.join(root, 'tools', 'ledger', 'report.mjs')
const fixtures = path.join(root, 'tests', 'fixtures', 'transcripts')

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
}

function runHook(dir, payload) {
  return execFileSync(process.execPath, [hook], { input: JSON.stringify(payload), env: { ...process.env, LEDGER_DIR: dir }, encoding: 'utf8' })
}

// execFile's async form (unlike execFileSync) has no `input` option — its stdin stays open
// forever waiting for data, hanging the hook's readStdin(). Spawn directly and write+end
// stdin ourselves so the process can actually finish while the test does other things.
function runHookAsync(dir, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env: { ...process.env, LEDGER_DIR: dir } })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`hook exited ${code}`))))
    child.stdin.end(JSON.stringify(payload))
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readLedger(dir) {
  const file = path.join(dir, 'token-ledger.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
}

describe('token ledger hook', () => {
  it('records a sub-agent once, deduplicating repeated message ids and pricing by model', () => {
    const dir = freshDir()
    const payload = {
      hook_event_name: 'SubagentStop',
      session_id: 's1',
      agent_id: 'aexplore-1',
      agent_type: 'Explore',
      transcript_path: path.join(fixtures, 'subagent-opus.jsonl'),
    }
    runHook(dir, payload)
    const rows = readLedger(dir)
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.equal(row.scope, 'subagent')
    assert.equal(row.agent_type, 'Explore')
    assert.equal(row.model, 'claude-opus-5')
    assert.equal(row.messages, 2, 'two distinct message ids, not three lines')
    assert.equal(row.output_tokens, 420, 'last line of msg_01 (300) + msg_02 (120)')
    assert.equal(row.thinking_tokens, 200)
    assert.equal(row.cache_creation_input_tokens, 31000)
    assert.equal(row.cache_read_input_tokens, 30000)
    assert.equal(row.assumed, false)
    // opus: input 5/M, output 25/M; cache create 1.25x, cache read 0.1x
    const expected = (15 * 5 + 31000 * 5 * 1.25 + 30000 * 5 * 0.1 + 420 * 25) / 1e6
    assert.ok(Math.abs(row.est_usd - expected) < 1e-6, `est_usd ${row.est_usd} vs ${expected}`)
    assert.equal(row.duration_ms, 8000)

    runHook(dir, payload)
    assert.equal(readLedger(dir).length, 1, 'a second identical payload does not append')
  })

  it('records the main session per turn, only the messages since the last turn', () => {
    const dir = freshDir()
    // The dedupe state is keyed by the transcript's own path, matching production: a
    // session's transcript is one file that grows in place across turns, so this fixture
    // simulates that by writing turn 1's content, running the hook, then growing the SAME
    // file to turn 2's content before running the hook again.
    const transcriptFile = path.join(dir, 'growing-session.jsonl')
    const base = { hook_event_name: 'Stop', session_id: 'main-1', transcript_path: transcriptFile }
    fs.writeFileSync(transcriptFile, fs.readFileSync(path.join(fixtures, 'session-sonnet.jsonl')))
    runHook(dir, base)
    fs.writeFileSync(transcriptFile, fs.readFileSync(path.join(fixtures, 'session-sonnet-turn2.jsonl')))
    runHook(dir, base)
    const rows = readLedger(dir)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].scope, 'session')
    assert.equal(rows[0].messages, 2)
    assert.equal(rows[0].output_tokens, 200)
    assert.equal(rows[1].messages, 1, 'turn 2 records only the new message')
    assert.equal(rows[1].output_tokens, 90)
    assert.equal(rows[1].model, 'claude-sonnet-5')
  })

  it("uses the sub-agent's own transcript (agent_transcript_path), not the ever-growing parent transcript_path", () => {
    // Real SubagentStop payloads (captured via LEDGER_DEBUG=1 against CLI 2.1.263) carry
    // transcript_path pointing at the PARENT (main session) transcript and a separate
    // agent_transcript_path pointing at the sub-agent's own transcript. The previous hook
    // used transcript_path for everything, which mis-attributed the whole (ever-growing)
    // parent transcript to every sub-agent spawned.
    const dir = freshDir()
    const payload = {
      hook_event_name: 'SubagentStop',
      session_id: 's-real',
      agent_id: 'areal-1',
      agent_type: 'Explore',
      transcript_path: path.join(fixtures, 'parent-session.jsonl'),
      agent_transcript_path: path.join(fixtures, 'subagents', 'agent-real-explore.jsonl'),
    }
    runHook(dir, payload)
    const rows = readLedger(dir)
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.equal(row.scope, 'subagent')
    assert.equal(row.agent_type, 'Explore')
    assert.equal(row.messages, 2, "two distinct messages in the sub-agent's own transcript")
    assert.equal(row.output_tokens, 130, "50 + 80, the sub-agent's own output, not the parent's 900 + 700")
    assert.equal(row.thinking_tokens, 20)

    // The main session's own Stop event reads the parent transcript independently and in
    // full — it must not see fewer messages because the sub-agent row "used up" state for it.
    runHook(dir, { hook_event_name: 'Stop', session_id: 's-real', transcript_path: path.join(fixtures, 'parent-session.jsonl') })
    const rows2 = readLedger(dir)
    assert.equal(rows2.length, 2)
    assert.equal(rows2[1].scope, 'session')
    assert.equal(rows2[1].messages, 2)
    assert.equal(rows2[1].output_tokens, 1600, "900 + 700, the parent's own tokens")
  })

  it('ignores a sub-agent spawn whose own transcript was never written, instead of falling back to the parent transcript', () => {
    // A cancelled/failed spawn can get an agent_id and a SubagentStop event without Claude
    // Code ever writing that agent's own transcript file. Falling back to transcript_path
    // here would silently resurrect the mis-attribution bug (a ghost row with the parent's
    // numbers and no agent_type) — the fix must skip it instead.
    const dir = freshDir()
    const payload = {
      hook_event_name: 'SubagentStop',
      session_id: 's-ghost',
      agent_id: 'aghost-1',
      agent_type: null,
      transcript_path: path.join(fixtures, 'parent-session.jsonl'),
      agent_transcript_path: path.join(fixtures, 'subagents', 'agent-does-not-exist.jsonl'),
    }
    runHook(dir, payload)
    assert.equal(readLedger(dir).length, 0, 'no row for a sub-agent that never got its own transcript')
  })

  it('finds a worktree-isolated sub-agent\'s own transcript even when agent_transcript_path is absent from the payload', () => {
    // Real payload captured via LEDGER_DEBUG=1 (CLI 2.1.263, 2026-09-07 repro): a
    // worktree-isolated sub-agent's SubagentStop event had NO agent_transcript_path field at
    // all. Falling straight through to transcript_path (the parent) reproduced the historical
    // mis-attribution bug live. The fix looks for the standard subagents/agent-<id>.jsonl file
    // itself, using only transcript_path's own directory and session_id.
    const dir = freshDir()
    const payload = {
      hook_event_name: 'SubagentStop',
      session_id: 's-worktree',
      agent_id: 'aworktree-1',
      agent_type: 'Explore',
      transcript_path: path.join(fixtures, 'parent-session.jsonl'),
      // no agent_transcript_path field at all
    }
    runHook(dir, payload)
    const rows = readLedger(dir)
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.equal(row.scope, 'subagent')
    assert.equal(row.messages, 2, "two messages in the sub-agent's own transcript")
    assert.equal(row.output_tokens, 100, "60 + 40, the sub-agent's own output, not the parent's 900 + 700")
    assert.equal(row.input_tokens, 5)
  })

  it('maps three consecutive worktree SubagentStop events to their own three distinct transcripts, never colliding', () => {
    // Reproduced live with three real worktree agents finishing ~15:22 (2026-09-07 repro):
    // two of three SubagentStop rows came out byte-identical to each other AND to an
    // intervening session Stop row. Each payload DID carry its own distinct agent_id
    // (afbdec1b3e8e7d908, ac85e345b92791f12, a37a925661289001c) — this was never a "no
    // agent_id" case — so three different agent_ids must resolve to three different files,
    // not accidentally share one.
    const dir = freshDir()
    const session = 's-three'
    const transcriptPath = path.join(fixtures, 'parent-session.jsonl')
    for (const [agentId, expectedOutput] of [['a1', 11], ['a2', 22], ['a3', 33]]) {
      runHook(dir, { hook_event_name: 'SubagentStop', session_id: session, agent_id: agentId, agent_type: 'general-purpose', transcript_path: transcriptPath })
    }
    const rows = readLedger(dir)
    assert.equal(rows.length, 3)
    const byAgent = Object.fromEntries(rows.map((r) => [r.agent_id, r]))
    assert.equal(byAgent.a1.output_tokens, 11)
    assert.equal(byAgent.a2.output_tokens, 22)
    assert.equal(byAgent.a3.output_tokens, 33)
    const resolvedPaths = new Set(rows.map((r) => r.transcript))
    assert.equal(resolvedPaths.size, 3, 'three distinct resolved transcript paths, not one shared file')
    for (const p of resolvedPaths) assert.notEqual(p, path.resolve(transcriptPath), 'none of them fell back to the parent transcript')
  })

  it('retries briefly when the sub-agent transcript file appears a beat after SubagentStop fires, instead of falling back to the parent', async () => {
    // Ledger row `ts` vs the real file's own mtime, from the same 2026-09-07 repro: the row
    // was written 190-390ms BEFORE the file's mtime for all three agents — the hook ran (and
    // gave up) before the file was even visible in the directory listing. This simulates that
    // window: the subagents/ directory exists up front (so the retry path is used, not the
    // fast-fail "no such directory" path) but the specific agent's file is created 150ms after
    // the hook starts, comfortably inside the retry budget.
    const dir = freshDir()
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-race-'))
    fs.copyFileSync(path.join(fixtures, 'parent-session.jsonl'), path.join(root2, 'parent-session.jsonl'))
    const subDir = path.join(root2, 's-race', 'subagents')
    fs.mkdirSync(subDir, { recursive: true }) // directory exists already, file does not yet
    const payload = { hook_event_name: 'SubagentStop', session_id: 's-race', agent_id: 'arace-1', agent_type: 'general-purpose', transcript_path: path.join(root2, 'parent-session.jsonl') }

    const hookPromise = runHookAsync(dir, payload)
    await sleep(150)
    fs.writeFileSync(path.join(subDir, 'agent-arace-1.jsonl'), fs.readFileSync(path.join(fixtures, 's-three', 'subagents', 'agent-a1.jsonl')))
    await hookPromise

    const rows = readLedger(dir)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].output_tokens, 11, "the sub-agent's own (late-arriving) transcript, not the parent's")
  })

  it("does not let a session Stop event double-count a message a mis-fallback subagent row already claimed on the same resolved transcript", () => {
    // Guards the dedupe-key fix: rows are keyed by resolved transcript path ALONE (not
    // prefixed by scope). A scope-prefixed key let a subagent row and the real session Stop
    // row each independently claim the same message when both happened to resolve to the
    // same (parent) file — double-counting it on top of the mis-attribution itself.
    const dir = freshDir()
    const transcriptPath = path.join(fixtures, 'parent-session.jsonl') // 2 messages: out=900, out=700
    // Force the historical fallback: agent_id with no matching subagents/ dir anywhere.
    runHook(dir, { hook_event_name: 'SubagentStop', session_id: 's-collide', agent_id: 'acollide-1', agent_type: 'general-purpose', transcript_path: transcriptPath })
    runHook(dir, { hook_event_name: 'Stop', session_id: 's-collide', transcript_path: transcriptPath })
    const rows = readLedger(dir)
    assert.equal(rows.length, 1, 'the subagent row claimed both messages; the session Stop event has nothing new left to record')
    assert.equal(rows[0].scope, 'subagent')
    assert.equal(rows[0].output_tokens, 1600, '900 + 700, claimed exactly once')
  })

  it('flags an unknown model as assumed and prices it as the default family', () => {
    const dir = freshDir()
    runHook(dir, { hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'averifier-9', agent_type: 'verifier', transcript_path: path.join(fixtures, 'subagent-unknown-model.jsonl') })
    const [row] = readLedger(dir)
    assert.equal(row.assumed, true)
    assert.ok(Math.abs(row.est_usd - (1000 * 2 + 100 * 10) / 1e6) < 1e-9)
  })

  it('ignores payloads without a transcript and malformed input', () => {
    const dir = freshDir()
    runHook(dir, { hook_event_name: 'Stop', session_id: 'x' })
    execFileSync(process.execPath, [hook], { input: 'not json', env: { ...process.env, LEDGER_DIR: dir }, encoding: 'utf8' })
    assert.equal(readLedger(dir).length, 0)
  })

  it('reports a table with a total and a models line', () => {
    const dir = freshDir()
    runHook(dir, { hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'aexplore-1', agent_type: 'Explore', transcript_path: path.join(fixtures, 'subagent-opus.jsonl') })
    runHook(dir, { hook_event_name: 'Stop', session_id: 's1', transcript_path: path.join(fixtures, 'session-sonnet.jsonl') })
    const out = execFileSync(process.execPath, [report], { env: { ...process.env, LEDGER_DIR: dir }, encoding: 'utf8' })
    assert.match(out, /TOTAL/)
    assert.match(out, /Explore/)
    assert.match(out, /main/)
    assert.match(out, /models seen: opus-5, sonnet-5/)
    assert.match(out, /2 entries · 1 sub-agents/)
  })

  it('says so when there is no ledger yet', () => {
    const dir = freshDir()
    const out = execFileSync(process.execPath, [report], { env: { ...process.env, LEDGER_DIR: dir }, encoding: 'utf8' })
    assert.match(out, /No ledger yet/)
  })
})
