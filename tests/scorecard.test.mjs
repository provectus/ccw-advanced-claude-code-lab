import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scorecard = path.join(root, 'tools', 'scorecard', 'scorecard.mjs')

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-'))
}

function writeLedger(dir, rows) {
  fs.writeFileSync(path.join(dir, 'token-ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
}

function run(dir, args) {
  return execFileSync(process.execPath, [scorecard, ...args], { env: { ...process.env, LEDGER_DIR: dir }, encoding: 'utf8' })
}

function row(overrides) {
  return {
    ts: '2026-09-07T10:00:00.000Z',
    event: 'Stop',
    scope: 'session',
    agent_type: null,
    model: 'claude-sonnet-5',
    total_tokens: 1000,
    est_usd: 0.01,
    ...overrides,
  }
}

describe('scorecard', () => {
  it('says so when there is nothing to print yet', () => {
    const dir = freshDir()
    const out = run(dir, [])
    assert.match(out, /No scorecard rows yet/)
  })

  it('adds a row summarising the ledger rows appended so far, and marks them consumed', () => {
    const dir = freshDir()
    writeLedger(dir, [
      row({ ts: '2026-09-07T10:00:00.000Z', scope: 'subagent', agent_type: 'Explore', total_tokens: 5000, est_usd: 0.02 }),
      row({ ts: '2026-09-07T10:00:30.000Z', scope: 'session', total_tokens: 2000, est_usd: 0.01 }),
    ])
    const out = run(dir, ['add', 'Rung 1', '--result', 'six file:line hits', '--risk', 'could have grepped one file only'])
    assert.match(out, /Rung 1/)

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.last_consumed, 2)
    assert.equal(card.rows.length, 1)
    assert.equal(card.rows[0].agents, 1, 'one subagent-scope row')
    assert.equal(card.rows[0].tokens, 7000)
    assert.ok(Math.abs(card.rows[0].est_usd - 0.03) < 1e-9)
    assert.equal(card.rows[0].wall, '00:30')
    assert.equal(card.rows[0].result, 'six file:line hits')
    assert.equal(card.rows[0].risk, 'could have grepped one file only')

    const md = fs.readFileSync(path.join(dir, 'scorecard.md'), 'utf8')
    assert.match(md, /Rung 1/)
    assert.match(md, /TOTAL/)
    assert.match(md, /estimates from tools\/ledger\/prices\.json/)
  })

  it('only counts rows appended since the previous mark', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ ts: '2026-09-07T10:00:00.000Z', scope: 'subagent', total_tokens: 1000, est_usd: 0.01 })])
    run(dir, ['add', 'Rung 1', '--result', 'first'])

    writeLedger(dir, [
      row({ ts: '2026-09-07T10:00:00.000Z', scope: 'subagent', total_tokens: 1000, est_usd: 0.01 }),
      row({ ts: '2026-09-07T10:05:00.000Z', scope: 'subagent', total_tokens: 3000, est_usd: 0.02 }),
      row({ ts: '2026-09-07T10:05:20.000Z', scope: 'subagent', total_tokens: 500, est_usd: 0.005 }),
    ])
    run(dir, ['add', 'Rung 2', '--result', 'second'])

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.rows.length, 2)
    assert.equal(card.rows[1].agents, 2, 'only the two new rows, not the already-consumed first one')
    assert.equal(card.rows[1].tokens, 3500)
    assert.equal(card.rows[1].wall, '00:20')
  })

  it('prints "no ledger rows since the last mark" instead of a zero row', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 100, est_usd: 0.001 })])
    run(dir, ['add', 'Rung 1', '--result', 'first'])

    const out = run(dir, ['add', 'Rung 2', '--result', 'second'])
    assert.match(out, /no ledger rows since the last mark/)

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.rows.length, 1, 'no second row was added')
  })

  it("adds a zero row when the result is 'not run' and nothing new is in the ledger", () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 100, est_usd: 0.001 })])
    run(dir, ['add', 'Rung 1', '--result', 'first'])

    const out = run(dir, ['add', 'Rung 5: an agent team', '--result', 'not run', '--risk', 'setup lacked agent teams'])
    assert.match(out, /not run/)

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.rows.length, 2, 'the not-run row was still added')
    assert.equal(card.rows[1].agents, 0)
    assert.equal(card.rows[1].tokens, 0)
    assert.equal(card.rows[1].est_usd, 0)
    assert.equal(card.rows[1].wall, '00:00')
    assert.equal(card.rows[1].result, 'not run')

    const md = fs.readFileSync(path.join(dir, 'scorecard.md'), 'utf8')
    const dataLine = md.split('\n').find((l) => l.includes('Rung 5: an agent team'))
    assert.match(dataLine, /not run/)
  })

  it('requires --result', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent' })])
    assert.throws(() => run(dir, ['add', 'Rung 1']))
  })

  it('escapes pipes in free-text cells so the markdown table stays valid', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 10, est_usd: 0.001 })])
    run(dir, ['add', 'Rung 1', '--result', 'found a | in the diff', '--risk', 'none'])
    const md = fs.readFileSync(path.join(dir, 'scorecard.md'), 'utf8')
    assert.match(md, /found a \\\| in the diff/)
  })

  it('stores --score in scorecard.json and shows it in the markdown row', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 1000, est_usd: 0.01 })])
    run(dir, ['add', 'Rung 3', '--result', 'found 4, confirmed 4, refuted 0', '--score', '4/4'])

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.rows[0].score, '4/4')

    const md = fs.readFileSync(path.join(dir, 'scorecard.md'), 'utf8')
    const dataLine = md.split('\n').find((l) => l.includes('Rung 3'))
    const cells = dataLine.split('|').map((c) => c.trim())
    assert.equal(cells[4], '4/4', 'correct cell carries the score')
  })

  it('leaves score blank and does not crash when --score is omitted', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 1000, est_usd: 0.01 })])
    const out = run(dir, ['add', 'Rung 1', '--result', 'six file:line hits'])
    assert.match(out, /Rung 1/)

    const card = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'))
    assert.equal(card.rows[0].score, '')

    const md = fs.readFileSync(path.join(dir, 'scorecard.md'), 'utf8')
    const dataLine = md.split('\n').find((l) => l.includes('Rung 1'))
    const cells = dataLine.split('|').map((c) => c.trim())
    assert.equal(cells[4], '', 'correct cell is blank when no --score was given')
    assert.equal(cells[5], '1', 'agents cell still follows immediately after the blank correct cell')
  })

  it('still prints an older scorecard.json whose rows have no score field', () => {
    const dir = freshDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'scorecard.json'),
      JSON.stringify({
        last_consumed: 1,
        rows: [{ step: 'Rung 1', result: 'first', risk: '', agents: 1, tokens: 100, est_usd: 0.001, wall: '00:00' }],
      }),
    )
    const out = run(dir, [])
    assert.match(out, /Rung 1/)
    const cols = out
      .split('\n')[0]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
    assert.deepEqual(cols, ['#', 'step', 'what came back', 'correct', 'agents', 'tokens', 'est $', 'wall', 'what could have gone wrong'])
  })

  it('prints a header with "correct" between "what came back" and "agents"', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 1000, est_usd: 0.01 })])
    run(dir, ['add', 'Rung 1', '--result', 'first', '--score', '4/4'])

    const out = run(dir, [])
    const cols = out
      .split('\n')[0]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
    assert.deepEqual(cols.slice(0, 4), ['#', 'step', 'what came back', 'correct'])
    assert.equal(cols[4], 'agents')
  })

  it('resets by archiving the scorecard and starting fresh', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 100, est_usd: 0.001 })])
    run(dir, ['add', 'Rung 1', '--result', 'first'])

    const out = run(dir, ['reset'])
    assert.match(out, /archived/)
    assert.ok(fs.existsSync(path.join(dir, 'scorecard-1.json')))
    assert.ok(!fs.existsSync(path.join(dir, 'scorecard.json')))

    const printed = run(dir, [])
    assert.match(printed, /No scorecard rows yet/)
  })

  it('archives to successive numbered files across repeated resets', () => {
    const dir = freshDir()
    writeLedger(dir, [row({ scope: 'subagent', total_tokens: 100, est_usd: 0.001 })])
    run(dir, ['add', 'Rung 1', '--result', 'first'])
    run(dir, ['reset'])
    run(dir, ['add', 'Rung 1', '--result', 'again'])
    run(dir, ['reset'])
    assert.ok(fs.existsSync(path.join(dir, 'scorecard-1.json')))
    assert.ok(fs.existsSync(path.join(dir, 'scorecard-2.json')))
  })
})
