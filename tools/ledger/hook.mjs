#!/usr/bin/env node
// Token ledger hook. Wired to SubagentStop and Stop in .claude/settings.json.
//
// Reads the hook payload from stdin, opens the transcript it points at, sums the token
// usage of the assistant messages that have not been recorded yet, prices them per model,
// and appends one JSON line to runs/token-ledger.jsonl.
//
// - SubagentStop: the sub-agent's transcript is complete; one line per sub-agent.
// - Stop: the main session's transcript keeps growing; one line per turn (messages since
//   the last recorded one).
// A transcript line per content block repeats the same message id, and only the last one
// carries the final output_tokens, so messages are deduplicated by id, last line wins.
//
// ## Which transcript field to read (found by capturing real payloads, LEDGER_DEBUG=1)
//
// A SubagentStop payload carries TWO transcript fields, and they are not interchangeable:
//   - transcript_path: the PARENT transcript (the main session, or an ancestor agent for a
//     nested spawn). It keeps growing for the rest of the run.
//   - agent_transcript_path: the sub-agent's own, self-contained transcript. This is what a
//     SubagentStop event should be priced against.
// The previous version of this hook always used transcript_path. For a SubagentStop event
// that is the wrong file: it reads the ever-growing parent transcript and (because each
// sub-agent has a fresh, never-before-seen agent_id) records the ENTIRE parent transcript
// seen so far as if it were that one sub-agent's usage — once per sub-agent spawned. That
// produces "subagent" rows with numbers that mirror or dwarf the main session's own numbers,
// and double-counts those same parent tokens again under the session's own Stop-scoped rows.
// It also means a spawn attempt that gets cancelled/retried before Claude Code ever assigns
// it a real sub-agent transcript still produces a row (agent_type missing) with the parent's
// numbers — a ghost entry with no sub-agent behind it.
//
// The fix: for a SubagentStop event, prefer agent_transcript_path when the payload has it
// (this is what real Claude Code sends today for most spawns; captured 2026-09-07 against
// CLI 2.1.263). Crucially, the existence check on that path triggers on the field being
// *absent*, not on the file it points to being missing: a SubagentStop payload that *has*
// agent_transcript_path but whose file does not exist (a cancelled/failed spawn) is skipped
// outright via the file-existence check below, rather than silently falling back to (and
// thus re-triggering the exact bug against) the parent transcript.
//
// agent_transcript_path is NOT always present, though: a worktree-isolated sub-agent was
// observed (LEDGER_DEBUG=1 repro, 2026-09-07, same CLI build) to fire SubagentStop with no
// agent_transcript_path field in the payload at all — falling straight through to
// transcript_path would resurrect the exact parent-transcript bug for exactly the isolation
// mode meant to keep sub-agents independent. So when agent_transcript_path is absent, this
// hook looks for the standard subagents/agent-<id>.jsonl file itself (searched recursively,
// since a dynamic-workflow spawn nests it one directory deeper) using only the payload's own
// transcript_path and session_id — no CLAUDE_PROJECT_DIR or env needed — before ever falling
// back to using transcript_path directly, which is reserved for older/other payload shapes
// that put the sub-agent's own transcript there in the first place.
//
// Real captured payloads never showed the same sub-agent (same resolved transcript) reported
// twice with agent_type changing from empty to filled in — every agent_id in a real run's
// ledger appears exactly once. What looked like "the same sub-agent twice" turned out to be
// distinct sub-agent spawns (sometimes one real + one ghost) that coincidentally produced
// identical numbers, only because both were mis-reading the same (momentarily static) parent
// transcript. So there is no agent_type patch-in-place here: keying by the resolved
// transcript path (below) already guarantees at most one row per real sub-agent, since a
// sub-agent has exactly one transcript file for its whole lifetime, and a real one is
// reported with its agent_type already filled in.
//
// Dedupe key: the resolved transcript path ALONE — not scope, not agent_id/session_id, and
// deliberately not prefixed by "subagent"/"session". Two rows that (correctly, or through a
// bug) resolve to the identical file must share the exact same "messages already recorded"
// boundary, whatever scope either of them was filed under: a scope-prefixed key was tried
// first and, when the mis-attribution below put a subagent row and the real session Stop row
// on the very same parent transcript, let both of them independently claim the same message
// — double-counting it, on top of the mis-attribution itself. Keying by the bare path can, at
// worst, split one file's tokens across rows under the wrong label; it can never double- or
// under-count the run's real total.
//
// Concurrency race (three simultaneous worktree agents, 2026-09-07 repro): even after
// preferring the sub-agent's own file, its SubagentStop hook can run to completion BEFORE
// that file is fully flushed to disk — comparing this run's ledger row `ts` against the real
// file's mtime showed the row was written 190-390ms *before* the file's own mtime, for all
// three agents. findAgentTranscript() below retries briefly (only when the subagents/
// directory itself already exists — see its own comment) to close that window before ever
// falling back to the parent transcript.
//
// Env: CLAUDE_PROJECT_DIR (set by Claude Code) locates runs/; LEDGER_DIR overrides it.
// LEDGER_DEBUG=1 appends every raw payload (and key skip decisions) to runs/hook-payloads.jsonl.

import fs from 'node:fs'
import path from 'node:path'
import { readStdin } from '../hooks/stdin.mjs'
import { findFile, parseTranscript, summarizeMessages } from './transcript.mjs'

const isUnderSubagents = (p) => Boolean(p) && /[/\\]subagents[/\\]/.test(p)
const agentIdFromFilename = (p) => (p ? /agent-([^/\\]+)\.jsonl$/.exec(p)?.[1] ?? null : null)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
/** Looks for `filename` under `subagentsRoot` (any depth), retrying briefly to ride out the
 * disk-flush race documented above. Retrying is skipped entirely (fails fast) when
 * `subagentsRoot` doesn't exist at all — that's the signal for the older/other payload shape
 * that never writes per-agent files in the first place, not a timing race. */
async function findAgentTranscript(subagentsRoot, filename) {
  if (!fs.existsSync(subagentsRoot)) return null
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = findFile(subagentsRoot, filename)
    if (found) return found
    if (attempt < 5) await sleep(100)
  }
  return null
}

const raw = await readStdin()
let payload = {}
try {
  payload = JSON.parse(raw || '{}')
} catch {
  process.exit(0)
}

const runsDir = process.env.LEDGER_DIR || path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'runs')
fs.mkdirSync(runsDir, { recursive: true })
const debugPath = path.join(runsDir, 'hook-payloads.jsonl')
const debug = (extra) => {
  if (process.env.LEDGER_DEBUG !== '1') return
  const tp = payload.transcript_path ?? null
  fs.appendFileSync(
    debugPath,
    JSON.stringify({
      ts: new Date().toISOString(),
      payload,
      transcript_basename: tp ? path.basename(tp) : null,
      transcript_is_subagent: isUnderSubagents(tp),
      ...extra,
    }) + '\n',
  )
}

// Raw-payload capture happens before any dedupe/scope logic, exactly as received.
debug()

// A worktree-isolated sub-agent can also fire a bare Stop (not SubagentStop) whose own
// transcript_path already lives under subagents/ — that's still a sub-agent's own file, not
// the main session's, and recording it as a "session" row would both mislabel it and (via
// the shared dedupe key below) potentially race the real SubagentStop event for the same
// file. Treat that shape as a sub-agent too, deriving its id from the filename when the
// payload doesn't carry agent_id directly.
const derivedAgentId = payload.agent_id || agentIdFromFilename(payload.transcript_path)
const isSubagent = Boolean(derivedAgentId)

// Prefer the sub-agent's own transcript when the payload provides one, or when
// transcript_path already points at one (see above — no search needed in that case). When
// neither applies, look for the standard subagents/agent-<id>.jsonl file ourselves (searched
// recursively, since a dynamic-workflow spawn nests it one directory deeper, and retried
// briefly to ride out the disk-flush race — see findAgentTranscript's own comment) before
// ever falling back to transcript_path: a worktree-isolated sub-agent was observed
// (LEDGER_DEBUG=1, CLI 2.1.263, 2026-09-07 repro) to fire SubagentStop with NO
// agent_transcript_path field in the payload at all, which used to fall straight through to
// transcript_path — the PARENT transcript — resurrecting the historical mis-attribution bug
// for exactly the isolation mode meant to keep sub-agents independent. transcript_path's own
// directory already tells us where to look (<that dir>/<session_id>/subagents/…), with no
// need for CLAUDE_PROJECT_DIR or env. Only when no such file can be found do we fall back to
// transcript_path directly, which preserves the older/other payload shape where
// transcript_path itself already IS the sub-agent's own transcript (see the existing tests).
let transcript = null
if (isSubagent && payload.agent_transcript_path) {
  transcript = payload.agent_transcript_path
} else if (isSubagent && isUnderSubagents(payload.transcript_path)) {
  transcript = payload.transcript_path
} else if (isSubagent && payload.transcript_path && payload.session_id) {
  transcript = await findAgentTranscript(path.join(path.dirname(payload.transcript_path), payload.session_id, 'subagents'), `agent-${derivedAgentId}.jsonl`)
}
if (!transcript) transcript = payload.transcript_path

if (!transcript) {
  debug({ skipped: 'no transcript path resolved' })
  process.exit(0)
}
if (!fs.existsSync(transcript)) {
  debug({ skipped: 'resolved transcript does not exist on disk', resolved_transcript: transcript })
  process.exit(0)
}

const ledgerPath = path.join(runsDir, 'token-ledger.jsonl')
const statePath = path.join(runsDir, '.ledger-state.json')

const state = readJson(statePath) ?? {}
const key = path.resolve(transcript)

const messages = parseTranscript(transcript)
if (messages.length === 0) process.exit(0)

let slice = messages
const lastRecorded = state[key]
if (lastRecorded) {
  const idx = messages.findIndex((m) => m.id === lastRecorded)
  if (idx >= 0) slice = messages.slice(idx + 1)
}
if (slice.length === 0) process.exit(0)

const summary = summarizeMessages(slice)

const line = {
  ts: new Date().toISOString(),
  event: payload.hook_event_name ?? (isSubagent ? 'SubagentStop' : 'Stop'),
  scope: isSubagent ? 'subagent' : 'session',
  agent_id: derivedAgentId,
  agent_type: payload.agent_type || null,
  session_id: payload.session_id ?? null,
  // The resolved path this row was actually priced against — lets dedupe.mjs (and anyone
  // auditing the ledger) check or re-key a row without re-deriving it from session_id/agent_id.
  transcript: key,
  ...summary,
}

fs.appendFileSync(ledgerPath, JSON.stringify(line) + '\n')
state[key] = slice[slice.length - 1].id
fs.writeFileSync(statePath, JSON.stringify(state, null, 2))

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
