import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statusline = path.join(root, 'tools', 'statusline', 'statusline.mjs')
const fixtures = path.join(root, 'tests', 'fixtures', 'transcripts')

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-'))
}

/** Runs the status line with `payload` on stdin and `runsDir` as its cache location. */
function run(runsDir, payload) {
  return execFileSync(process.execPath, [statusline], {
    input: JSON.stringify(payload),
    env: { ...process.env, LEDGER_DIR: runsDir, STATUSLINE_NO_COLOR: '1' },
    encoding: 'utf8',
  })
}

/** Pulls `input`/`cache-write`/`cache-read`/`output` off one rendered line, as raw strings. */
function counters(line) {
  const m = /input (\S+)\s+cache-write (\S+)\s+cache-read (\S+)\s+output (\S+)/.exec(line)
  assert.ok(m, `no counter split in: ${line}`)
  return { new: m[1], cw: m[2], cr: m[3], out: m[4] }
}

function assistantLine(id, usage, model = 'claude-sonnet-5') {
  return JSON.stringify({
    type: 'assistant',
    uuid: id,
    timestamp: '2026-09-07T12:00:00.000Z',
    message: { id, model, role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage },
  })
}

describe('status line', () => {
  it('reports the four token counters separately and never sums them', () => {
    const out = run(freshDir(), {
      session_id: 'no-such-session',
      transcript_path: path.join(fixtures, 'session-sonnet.jsonl'),
      model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' },
    })
    const [head, main, subs] = out.trim().split('\n')

    assert.match(head, /^Sonnet 5\b/)
    // Cumulative across both messages: 20+8, 5000+200, 40000+45000, 60+140.
    assert.deepEqual(counters(main), { new: '28', cw: '5.2k', cr: '85k', out: '200' })
    assert.match(subs, /agents none yet/)
  })

  it('shows context as the last message alone, not the sum of every turn', () => {
    const out = run(freshDir(), {
      session_id: 's',
      transcript_path: path.join(fixtures, 'session-sonnet.jsonl'),
      model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' },
    })
    // Last message only: 8 + 200 + 45000 = 45208. Summing both turns would give 90.2k.
    assert.match(out, /context 45\.2k\/1M 5%/)
  })

  it('defaults to a 1M window and takes a smaller one only from context-windows.json', () => {
    const payload = { session_id: 's', transcript_path: path.join(fixtures, 'session-sonnet.jsonl') }
    assert.match(run(freshDir(), { ...payload, model: { id: 'claude-opus-5[1m]' } }), /context 45\.2k\/1M /)
    assert.match(run(freshDir(), { ...payload, model: { id: 'claude-sonnet-5' } }), /context 45\.2k\/1M /)
    assert.match(run(freshDir(), { ...payload, model: { id: 'claude-haiku-4-5-20251001' } }), /context 45\.2k\/200k /)
  })

  it('promotes a window size that the observed context has already disproved', () => {
    const dir = freshDir()
    const transcript = path.join(dir, 'main.jsonl')
    // 300k of context on a model configured as 200k: the configured size is provably wrong.
    fs.writeFileSync(transcript, assistantLine('msg_1', { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 300_000, output_tokens: 1 }) + '\n')
    const out = run(dir, { session_id: 's', transcript_path: transcript, model: { id: 'claude-haiku-4-5-20251001' } })
    assert.match(out, /context 300k\/500k 60%/)
  })

  it('totals sub-agents from their own transcripts, including a nested workflow spawn', () => {
    const dir = freshDir()
    const transcript = path.join(dir, 'main.jsonl')
    fs.writeFileSync(transcript, assistantLine('msg_main', { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }) + '\n')

    const subagents = path.join(dir, 's-x', 'subagents')
    const nested = path.join(subagents, 'workflows', 'wf-1')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(subagents, 'agent-a1.jsonl'), assistantLine('msg_a1', { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 }) + '\n')
    fs.writeFileSync(path.join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'verifier' }))
    fs.writeFileSync(path.join(nested, 'agent-a2.jsonl'), assistantLine('msg_a2', { input_tokens: 20, cache_creation_input_tokens: 200, cache_read_input_tokens: 2000, output_tokens: 15 }) + '\n')
    fs.writeFileSync(path.join(nested, 'agent-a2.meta.json'), JSON.stringify({ agentType: 'verifier' }))

    const subs = run(dir, { session_id: 's-x', transcript_path: transcript, model: { id: 'claude-sonnet-5' } }).trim().split('\n')[2]
    assert.match(subs, /^agents 2 \(verifier x2\)/)
    assert.deepEqual(counters(subs), { new: '30', cw: '300', cr: '3k', out: '20' })
  })

  it('matches a cold parse after reading only the bytes appended since the last refresh', () => {
    const dir = freshDir()
    const transcript = path.join(dir, 'main.jsonl')
    const usage = { input_tokens: 5, cache_creation_input_tokens: 50, cache_read_input_tokens: 500, output_tokens: 7 }
    fs.writeFileSync(transcript, assistantLine('msg_1', usage) + '\n')
    const payload = { session_id: 's', transcript_path: transcript, model: { id: 'claude-sonnet-5' } }

    run(dir, payload) // warms runs/.statusline-cache.json
    fs.appendFileSync(transcript, assistantLine('msg_2', usage) + '\n')
    const warm = run(dir, payload)
    const cold = run(freshDir(), payload)

    assert.deepEqual(counters(warm.split('\n')[1]), { new: '10', cw: '100', cr: '1k', out: '14' })
    assert.equal(warm, cold)
  })

  it('ignores a half-written trailing line until its newline lands', () => {
    const dir = freshDir()
    const transcript = path.join(dir, 'main.jsonl')
    const usage = { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 7 }
    fs.writeFileSync(transcript, assistantLine('msg_1', usage) + '\n')
    const payload = { session_id: 's', transcript_path: transcript, model: { id: 'claude-sonnet-5' } }

    fs.appendFileSync(transcript, assistantLine('msg_2', usage).slice(0, 40)) // no trailing newline
    assert.deepEqual(counters(run(dir, payload).split('\n')[1]), { new: '5', cw: '0', cr: '0', out: '7' })

    fs.appendFileSync(transcript, assistantLine('msg_2', usage).slice(40) + '\n')
    assert.deepEqual(counters(run(dir, payload).split('\n')[1]), { new: '10', cw: '0', cr: '0', out: '14' })
  })

  it('reparses from scratch when a transcript shrinks', () => {
    const dir = freshDir()
    const transcript = path.join(dir, 'main.jsonl')
    const usage = { input_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 7 }
    fs.writeFileSync(transcript, [assistantLine('msg_1', usage), assistantLine('msg_2', usage)].join('\n') + '\n')
    const payload = { session_id: 's', transcript_path: transcript, model: { id: 'claude-sonnet-5' } }

    run(dir, payload)
    fs.writeFileSync(transcript, assistantLine('msg_3', usage) + '\n')
    assert.deepEqual(counters(run(dir, payload).split('\n')[1]), { new: '5', cw: '0', cr: '0', out: '7' })
  })

  it('renders without a transcript instead of crashing', () => {
    const out = run(freshDir(), { session_id: 's', transcript_path: path.join(freshDir(), 'missing.jsonl'), model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' } })
    assert.match(out, /no usage yet/)
    assert.match(out, /context 0\/1M 0%/)
  })
})
