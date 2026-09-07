#!/usr/bin/env node
// PreToolUse hook for Edit|Write|MultiEdit: denies edits outside the paths listed in
// .claude/edit-scope (one path prefix per line, relative to the project root).
// No scope file, no guard.
//
// Pre-wired in .claude/settings.json under hooks.PreToolUse (matcher "Edit|Write|MultiEdit").
// To disable, delete that hooks.PreToolUse entry from .claude/settings.json.

import fs from 'node:fs'
import path from 'node:path'
import { readStdin } from '../../tools/hooks/stdin.mjs'

const payload = JSON.parse((await readStdin()) || '{}')
if (!['Edit', 'Write', 'MultiEdit'].includes(payload.tool_name)) process.exit(0)

const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd()
const scopeFile = path.join(projectDir, '.claude', 'edit-scope')
if (!fs.existsSync(scopeFile)) process.exit(0)

const allowed = fs
  .readFileSync(scopeFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => path.resolve(projectDir, l))

const target = path.resolve(projectDir, String(payload.tool_input?.file_path ?? ''))
const inside = allowed.some((dir) => target === dir || target.startsWith(dir + path.sep))
if (inside) process.exit(0)

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `edit-guard: ${path.relative(projectDir, target)} is outside the allowed scope (${allowed
        .map((d) => path.relative(projectDir, d))
        .join(', ')}). Fix the source inside the scope instead.`,
    },
  }),
)
