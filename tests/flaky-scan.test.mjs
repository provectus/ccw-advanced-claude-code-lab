import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { extractResults, summarize, toRepoRelative } from '../.claude/skills/flaky-scan/scripts/rerun.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rerunScript = path.join(root, '.claude', 'skills', 'flaky-scan', 'scripts', 'rerun.mjs')

function vitestPayload(fileAbs, results) {
  return {
    testResults: [
      {
        name: fileAbs,
        assertionResults: results.map(([title, status]) => ({ fullName: `suite ${title}`, title, status })),
      },
    ],
  }
}

describe('rerun.mjs JSON parsing (fixture-based, no subprocess)', () => {
  it('toRepoRelative normalises to a forward-slashed, repo-relative path', () => {
    const abs = path.join(root, 'kyc', 'tests', 'sla.test.ts')
    assert.equal(toRepoRelative(abs, root), 'kyc/tests/sla.test.ts')
  })

  it('extractResults flattens testResults/assertionResults and maps status to passed', () => {
    const fileAbs = path.join(root, 'kyc', 'tests', 'sla.test.ts')
    const payload = vitestPayload(fileAbs, [['ok', 'passed'], ['flakes', 'failed']])
    const results = extractResults(payload, root)
    assert.deepEqual(results, [
      { file: 'kyc/tests/sla.test.ts', name: 'suite ok', passed: true },
      { file: 'kyc/tests/sla.test.ts', name: 'suite flakes', passed: false },
    ])
  })

  it('summarize separates flaky (some but not all runs failed) from always-failing (every run failed)', () => {
    const runsResults = [
      [
        { file: 'a.test.ts', name: 'stable', passed: true },
        { file: 'a.test.ts', name: 'flaky', passed: true },
        { file: 'a.test.ts', name: 'broken', passed: false },
      ],
      [
        { file: 'a.test.ts', name: 'stable', passed: true },
        { file: 'a.test.ts', name: 'flaky', passed: false },
        { file: 'a.test.ts', name: 'broken', passed: false },
      ],
      [
        { file: 'a.test.ts', name: 'stable', passed: true },
        { file: 'a.test.ts', name: 'flaky', passed: true },
        { file: 'a.test.ts', name: 'broken', passed: false },
      ],
    ]
    const { flaky, alwaysFailing } = summarize(runsResults)
    assert.equal(flaky.length, 1)
    assert.equal(flaky[0].name, 'flaky')
    assert.equal(flaky[0].failed, 1)
    assert.equal(flaky[0].total, 3)
    assert.equal(alwaysFailing.length, 1)
    assert.equal(alwaysFailing[0].name, 'broken')
    assert.equal(alwaysFailing[0].failed, 3)
  })

  it('a test with zero failures across all runs is neither flaky nor always-failing', () => {
    const runsResults = [
      [{ file: 'a.test.ts', name: 'stable', passed: true }],
      [{ file: 'a.test.ts', name: 'stable', passed: true }],
    ]
    const { flaky, alwaysFailing } = summarize(runsResults)
    assert.deepEqual(flaky, [])
    assert.deepEqual(alwaysFailing, [])
  })
})

describe('rerun.mjs against the real kyc service (process boundary)', () => {
  it('finds the planted flaky SLA test and nothing else, over 4 runs', () => {
    // The random 5-44ms provider latency (kyc/src/verification.ts) against a 25ms SLA
    // (kyc/tests/sla.test.ts) means the SLA test can land as flaky (failed some runs) or, on an
    // unlucky draw, as always-failing (failed every run) — both are the same planted bug, so
    // either is an acceptable outcome. But with only 4 runs there's also a real (roughly 1-in-6
    // to 1-in-8) chance the SLA test happens to pass all 4 and is flagged in neither list — that
    // outcome says nothing about rerun.mjs being wrong, only that this particular batch of 4
    // didn't catch the flake. So: retry the whole 4-run batch a few times, requiring the SLA
    // test to show up flagged at least once; but fail immediately, on the first attempt, if any
    // *other* kyc test is ever flagged — that would be a real bug, not randomness.
    const MAX_ATTEMPTS = 5
    let slaFlaggedOnce = false

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !slaFlaggedOnce; attempt += 1) {
      const stdout = execFileSync(process.execPath, [rerunScript, 'kyc', '4'], { cwd: root, encoding: 'utf8' })
      const report = JSON.parse(stdout.trim().split('\n').pop())

      assert.equal(report.service, 'kyc')
      assert.equal(report.runs, 4)

      const flagged = [...report.flaky, ...report.alwaysFailing]
      const slaFlagged = flagged.filter((f) => f.file === 'kyc/tests/sla.test.ts')
      const otherFlagged = flagged.filter((f) => f.file !== 'kyc/tests/sla.test.ts')

      assert.deepEqual(otherFlagged, [], `no other kyc test should ever be flaky or always-failing, got ${JSON.stringify(otherFlagged)}`)
      assert.ok(slaFlagged.length <= 1, `expected at most one flagged entry for the SLA test, got ${JSON.stringify(slaFlagged)}`)
      slaFlaggedOnce = slaFlagged.length === 1
    }

    assert.ok(slaFlaggedOnce, `the SLA test never showed up as flaky or always-failing in ${MAX_ATTEMPTS} batches of 4 runs`)
  })
})
