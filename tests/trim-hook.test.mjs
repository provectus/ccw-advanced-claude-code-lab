import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = path.join(root, '.claude', 'hooks', 'trim-test-output.mjs')

function runHook(command) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
  const out = execFileSync(process.execPath, [hook], { input: payload, encoding: 'utf8' })
  if (!out.trim()) return null // no output means "allow, unchanged" (the PreToolUse default)
  return JSON.parse(out).hookSpecificOutput.updatedInput.command
}

describe('trim-test-output.mjs', () => {
  it('rewrites a bare npm test', () => {
    assert.equal(runHook('npm test'), 'npm test -- --reporter=dot')
  })

  it('inserts the flag before a pipe instead of appending after it', () => {
    // The old hook appended to the end of the whole string, so this became `tail`'s
    // argument (`tail: cannot open '--reporter=dot' for reading`).
    assert.equal(runHook('npm test 2>&1 | tail -40'), 'npm test -- --reporter=dot 2>&1 | tail -40')
  })

  it('inserts the flag after -w/--workspace, not before it', () => {
    // npm requires -w/--workspace before its own `--` separator, so the flag has to land
    // after "-w kyc", not between "test" and "-w".
    assert.equal(runHook('npm test -w kyc'), 'npm test -w kyc -- --reporter=dot')
  })

  it('inserts the flag before a redirect-and-chain instead of appending after it', () => {
    // The old hook's append landed after the `&&`, becoming literal text in the echoed
    // line rather than a flag vitest ever saw.
    assert.equal(runHook('npm run test:kyc > runs/out.txt && cat runs/out.txt'), 'npm run test:kyc -- --reporter=dot > runs/out.txt && cat runs/out.txt')
  })

  it('leaves a command that already picked a reporter untouched', () => {
    assert.equal(runHook('npx vitest run --reporter=json'), null)
  })

  it('leaves a non-test command untouched', () => {
    assert.equal(runHook('ls -la'), null)
  })
})
