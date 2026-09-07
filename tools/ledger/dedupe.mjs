#!/usr/bin/env node
// One-off repair tool for a token-ledger.jsonl written by the pre-fix hook.mjs.
//
// The old hook always read a SubagentStop event's transcript_path field, which is actually
// the PARENT (main session) transcript, not the sub-agent's own. Every "subagent" row is
// re-verified against the sub-agent's own transcript on disk (searched recursively under
// subagents/, since dynamic-workflow agents nest one directory deeper as
// subagents/workflows/<workflow-id>/agent-<id>.jsonl rather than the flat
// subagents/agent-<id>.jsonl):
//   - "corrected": the transcript was found and either its real totals differ from what the
//     row already had, or (a stronger, exact signal when hook.mjs recorded one) the row's own
//     `transcript` field names a different file than the one actually found here — the
//     misattribution case (the row was written against the parent's ever-growing transcript,
//     or a same-file race with another row). Recomputed from the real file either way.
//   - "unchanged": the transcript was found, matches what the row already had, and (when
//     present) the row's own `transcript` field agrees — nothing to fix (e.g. rows already
//     written by the fixed hook.mjs).
//   - "unverified": no transcript could be located anywhere under subagents/ (flat or
//     nested), or the one found has no assistant messages to parse. This is indistinguishable
//     from a genuine ghost (a cancelled/retried spawn that never got its own transcript) from
//     here, so rather than guess, the row is KEPT as-is with `unverified: true` added — an
//     unverified row might still be correct; deleting real data because our search path was
//     wrong is worse than silently dropping a row a human never gets to check.
// "session"-scoped rows (from Stop) were never affected by this bug — transcript_path was
// already correct for them — and are kept as-is.
//
// Usage:
//   node tools/ledger/dedupe.mjs [<ledger.jsonl>] [--out <path>] [--projects-root <dir>] [--project-dir <name>]
//
//   <ledger.jsonl>     defaults to $LEDGER_DIR/token-ledger.jsonl, or ./runs/token-ledger.jsonl
//   --out              defaults to the input path with .fixed.jsonl appended
//   --projects-root    defaults to ~/.claude/projects (where Claude Code keeps transcripts)
//   --project-dir      the encoded project directory name under --projects-root (Claude Code
//                       derives it from the repo's absolute path by replacing every character
//                       that isn't a letter, digit or hyphen with a hyphen). Defaults to that
//                       encoding of CLAUDE_PROJECT_DIR or the current working directory.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findFile, parseTranscript, summarizeMessages } from './transcript.mjs'

const args = process.argv.slice(2)
const flagNames = ['--out', '--projects-root', '--project-dir']
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
// The positional arg is whatever isn't a recognised flag and isn't a flag's value.
const consumed = new Set()
for (const name of flagNames) {
  const i = args.indexOf(name)
  if (i >= 0) {
    consumed.add(i)
    consumed.add(i + 1)
  }
}
const positional = args.find((a, i) => !consumed.has(i) && !a.startsWith('--'))

const input = positional ?? path.join(process.env.LEDGER_DIR || './runs', 'token-ledger.jsonl')
const outPath = flag('--out', input.replace(/\.jsonl$/, '') + '.fixed.jsonl')
const projectsRoot = flag('--projects-root', path.join(os.homedir(), '.claude', 'projects'))
const projectDirName = flag('--project-dir', (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/[^A-Za-z0-9-]/g, '-'))
const projectDir = path.join(projectsRoot, projectDirName)

if (!fs.existsSync(input)) {
  console.error(`No ledger found at ${input}`)
  process.exit(1)
}

const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))

let corrected = 0
let unverified = 0
let unchanged = 0
const outRows = []
for (const row of rows) {
  if (row.scope !== 'subagent') {
    outRows.push(row)
    continue
  }
  const found = locateAgentTranscript(projectDir, row.session_id, row.agent_id)
  const messages = found ? parseTranscript(found.transcript) : []
  if (!found || messages.length === 0) {
    outRows.push({ ...row, unverified: true })
    unverified++
    continue
  }
  const summary = summarizeMessages(messages)
  const agentType = row.agent_type || found.agentType || null
  const resolvedTranscript = path.resolve(found.transcript)
  // hook.mjs (since the concurrency fix) records which file it actually priced the row
  // against. If that disagrees with the file found here, the row is wrong regardless of
  // whether its totals happen to match by coincidence — a same-file race between two rows
  // (see hook.mjs's dedupe-key comment) can otherwise slip past the numeric check below.
  const resolvedMismatch = row.transcript && path.resolve(row.transcript) !== resolvedTranscript
  if (!resolvedMismatch && matchesRow(row, summary)) {
    outRows.push({ ...row, agent_type: agentType, transcript: resolvedTranscript })
    unchanged++
  } else {
    outRows.push({ ...row, agent_type: agentType, transcript: resolvedTranscript, ...summary })
    corrected++
  }
}

fs.writeFileSync(outPath, outRows.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log(
  `Read ${rows.length} rows (${rows.filter((r) => r.scope === 'subagent').length} subagent, ${rows.filter((r) => r.scope === 'session').length} session).`,
)
console.log(`corrected ${corrected}, unverified ${unverified}, unchanged ${unchanged}`)
console.log(`Wrote ${outPath}`)
console.log(
  `\nRun the report against it with:\n  LEDGER_DIR=${path.dirname(outPath)} node tools/ledger/report.mjs   (after renaming ${path.basename(outPath)} to token-ledger.jsonl, or copy it there — safe to do even with unverified rows present, since those are kept, not dropped)`,
)

/** True when a freshly computed summary matches what the row already recorded (nothing to
 * correct). Compares the totals that would actually change if the row were misattributed. */
function matchesRow(row, summary) {
  return row.total_tokens === summary.total_tokens && row.output_tokens === summary.output_tokens && Math.abs((row.est_usd ?? 0) - summary.est_usd) < 1e-9
}

/** Finds the sub-agent's own transcript file and, if present, its recorded agentType.
 * Searches subagents/ recursively (any depth) rather than assuming a flat layout: a
 * dynamically-spawned workflow sub-agent's transcript lives one directory deeper, at
 * subagents/workflows/<workflow-id>/agent-<id>.jsonl, and a workflow could conceivably
 * nest another workflow beneath it. There is exactly one real transcript per agent id for
 * its whole lifetime (see hook.mjs's header comment), so the first match found is safe. */
function locateAgentTranscript(projectDir, sessionId, agentId) {
  if (!sessionId || !agentId) return null
  const subagentsRoot = path.join(projectDir, sessionId, 'subagents')
  const transcript = findFile(subagentsRoot, `agent-${agentId}.jsonl`)
  if (!transcript) return null
  const metaPath = transcript.replace(/\.jsonl$/, '.meta.json')
  let agentType = null
  try {
    agentType = JSON.parse(fs.readFileSync(metaPath, 'utf8')).agentType ?? null
  } catch {
    // no sidecar meta file, or it doesn't parse — agentType stays null
  }
  return { transcript, agentType }
}
