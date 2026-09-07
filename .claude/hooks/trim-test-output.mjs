#!/usr/bin/env node
// PreToolUse hook for Bash: when the command runs the test suite, switch Vitest to the
// dot reporter so only failures and the summary reach Claude's context.
//
// Pre-wired in .claude/settings.json under hooks.PreToolUse (matcher "Bash").
// To disable, delete that hooks.PreToolUse entry from .claude/settings.json.
//
// Build-it bonus (step 16): clear .claude/settings.json's hooks block and re-wire this
// hook by hand to see the trimmer fire again on a failing `npm test`.
//
// The flag is inserted right after the recognised test-runner token, not appended to the
// end of the command: appending blindly broke `npm test 2>&1 | tail -40` (the flag became
// tail's argument) and `npm run test:kyc > out.txt && cat out.txt` (the flag became literal
// text after the `&&`). The one thing that has to ride ALONG with the token rather than
// after it is a trailing `-w`/`--workspace <name>` — npm needs that before its own `--`
// separator — so `npm test -w kyc` gets the flag after "-w kyc", not wedged before it.
// Everything past that point (a pipe, redirect, `&&`, `;`, or nothing) is left untouched.

import { readStdin } from '../../tools/hooks/stdin.mjs'

const payload = JSON.parse((await readStdin()) || '{}')
if (payload.tool_name !== 'Bash') process.exit(0)

const command = String(payload.tool_input?.command ?? '')
const TOKEN = /\bnpm\s+(?:run\s+test(?::[\w.-]+)?|test|t)\b(?:\s+(?:-w|--workspace)(?:=\S+|\s+\S+))?|\b(?:npx\s+vitest|vitest)\s+run\b/
const match = command.match(TOKEN)
if (!match || /--reporter/.test(command)) process.exit(0)

const flag = /^npm\b/.test(match[0]) ? ' -- --reporter=dot' : ' --reporter=dot'
const insertAt = match.index + match[0].length
const updated = command.slice(0, insertAt) + flag + command.slice(insertAt)

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'trim-test-output: dot reporter, failures only',
      updatedInput: { ...payload.tool_input, command: updated },
    },
  }),
)
