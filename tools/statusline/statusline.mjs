#!/usr/bin/env node
// Status line. Wired to `statusLine` in .claude/settings.json; also runnable standalone
// (`npm run statusline`) for testing, where it falls back to the newest transcript on disk.
//
// ## What it shows, and why every counter stays separate
//
// Four different counters get summed into one "tokens" figure by most tools. They cost
// different amounts and mean different things:
//
//   new  input_tokens                  — uncached prompt bytes. Full input price.
//   cw   cache_creation_input_tokens   — written into the prompt cache. 1.25x input price.
//   cr   cache_read_input_tokens       — served from the cache. 0.1x input price.
//   out  output_tokens                 — generated. Output price (5x input, per prices.json).
//
// A long session is mostly `cr`, which is why a 200k-token turn can cost cents: re-reading
// cached context is a tenth of the price of sending it fresh. Collapsing the four into one
// number hides the only lever you have, so this status line never sums them.
//
// Separately, and NOT additive with any of the above:
//
//   ctx  the CURRENT context window occupancy — input + cw + cr of the LAST assistant message.
//        A level, not a total. Summing per-turn numbers to get it is the most common mistake:
//        a 10-turn session can bill 2M tokens while never exceeding a 120k window, because the
//        same cached context is re-read every turn. The window SIZE it's measured against comes
//        from context-windows.json (1M by default) — edit that file, not this one, as models
//        change; contextLimit() below also promotes a size that observation has disproved.
//
// ## Sub-agents
//
// Sub-agent usage never appears in the main session's transcript — a sub-agent gets its own
// file under <session>/subagents/agent-<id>.jsonl (nested one level deeper for a dynamic
// workflow spawn). This reads those files directly rather than runs/token-ledger.jsonl, for
// two reasons: it sees agents that are still RUNNING (the ledger only gets a row at
// SubagentStop), and it is unaffected by the ledger's own dedupe and attribution state. The
// ledger stays the after-the-fact audit trail; this is the live meter. The two agree on
// definitions because both price through tools/ledger/pricing.mjs.
//
// ## Cost of the status line itself
//
// Re-parsing a 1 MB transcript on every refresh would be wasteful, so parsed messages are
// cached in runs/.statusline-cache.json keyed by file, and only the bytes appended since the
// last refresh are read. A file that shrank was rotated or /clear-ed; its entry is discarded.
//
// Env: STATUSLINE_CONTEXT_LIMIT overrides the auto-detected window size.
//      STATUSLINE_NO_COLOR=1 disables ANSI. STATUSLINE_DEBUG=1 dumps the raw stdin payload.

import fs from 'node:fs'
import path from 'node:path'
import { readStdin } from '../hooks/stdin.mjs'
import { summarizeMessages } from '../ledger/transcript.mjs'

const USAGE_KEYS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']

const raw = await readStdin()
let payload = {}
try {
  payload = JSON.parse(raw || '{}')
} catch {
  payload = {}
}

const projectDir = payload.workspace?.project_dir || process.env.CLAUDE_PROJECT_DIR || process.cwd()
const runsDir = process.env.LEDGER_DIR || path.join(projectDir, 'runs')

if (process.env.STATUSLINE_DEBUG === '1') {
  try {
    fs.mkdirSync(runsDir, { recursive: true })
    fs.appendFileSync(path.join(runsDir, 'statusline-payloads.jsonl'), JSON.stringify({ ts: new Date().toISOString(), payload }) + '\n')
  } catch {}
}

const transcript = payload.transcript_path || newestTranscript(projectDir)
// A session transcript is named <session_id>.jsonl, so a standalone run with no payload can
// still find the sub-agent directory that sits beside it.
const sessionId = payload.session_id || (transcript ? path.basename(transcript, '.jsonl') : null)

const cache = readJson(path.join(runsDir, '.statusline-cache.json')) ?? {}
const seen = new Set()

// --- main session -------------------------------------------------------------------------
const sessionMessages = transcript ? messagesOf(transcript) : []
const session = sessionMessages.length ? summarizeMessages(sessionMessages) : null
const ctxUsed = contextOf(sessionMessages)

// Payload first; the transcript's own busiest model is the fallback for a standalone run.
const modelId = payload.model?.id || session?.model || 'unknown'
const modelName = payload.model?.display_name || shortModel(modelId)
const ctxLimit = contextLimit(modelId, ctxUsed)

// --- sub-agents ---------------------------------------------------------------------------
const agentFiles = transcript && sessionId ? collectJsonl(path.join(path.dirname(transcript), sessionId, 'subagents')) : []
const agentMessages = agentFiles.flatMap((f) => messagesOf(f))
const agents = agentMessages.length ? summarizeMessages(agentMessages) : null
const agentTypes = tallyTypes(agentFiles)

writeCache()

// --- render -------------------------------------------------------------------------------
const runUsd = (session?.est_usd ?? 0) + (agents?.est_usd ?? 0)
const pct = ctxLimit ? ctxUsed / ctxLimit : 0
const paint = ctxColor(pct)

const lines = [
  `${c(modelName, '1;36')}  ${c('ctx', '2')} ${compact(ctxUsed)}/${compact(ctxLimit)} ${paint(pctStr(pct))} ${paint(bar(pct))}`,
  `${c('main', '2')}   ${split(session)}  ${c(usd(session?.est_usd ?? 0), '33')}`,
]
if (agentFiles.length) {
  const label = `${c('subs', '2')} ${agentFiles.length}${agentTypes ? c(` ${agentTypes}`, '2') : ''}`
  lines.push(`${label}  ${split(agents)}  ${c(usd(agents?.est_usd ?? 0), '33')}  ${c('run', '2')} ${c(usd(runUsd), '1;33')}`)
} else {
  lines.push(`${c('subs', '2')} ${c('none yet', '2')}`)
}
console.log(lines.join('\n'))

// --- helpers --------------------------------------------------------------------------------

/** `new / cw / cr / out` for one summary, never summed into a single figure. */
function split(s) {
  if (!s) return c('no usage yet', '2')
  return [
    `${c('new', '2')} ${compact(s.input_tokens)}`,
    `${c('cw', '2')} ${compact(s.cache_creation_input_tokens)}`,
    `${c('cr', '2')} ${compact(s.cache_read_input_tokens)}`,
    `${c('out', '2')} ${compact(s.output_tokens)}`,
  ].join('  ')
}

/**
 * Context window size for `modelId`, from context-windows.json (first substring match wins,
 * `default` otherwise). Model ids don't reliably state their window, so the guess is bounded
 * by evidence: a window we already know is too small — `observed` exceeds it — is promoted to
 * the smallest configured tier that fits, and failing that to `observed` itself, so the gauge
 * can never read over 100% or quietly hide how full the window is.
 */
function contextLimit(modelId, observed) {
  const override = Number(process.env.STATUSLINE_CONTEXT_LIMIT)
  if (override > 0) return override
  const cfg = readJson(new URL('./context-windows.json', import.meta.url)) ?? {}
  const id = String(modelId ?? '').toLowerCase()
  let limit = cfg.default ?? 1_000_000
  for (const [needle, size] of Object.entries(cfg.by_model_substring ?? {})) {
    if (id.includes(needle.toLowerCase())) {
      limit = size
      break
    }
  }
  if (observed <= limit) return limit
  return [...(cfg.tiers ?? [])].sort((a, b) => a - b).find((t) => t >= observed) ?? observed
}

/**
 * Current window occupancy: the last assistant message's input + cache write + cache read.
 * Deliberately the LAST message, not a sum — see the header note on ctx.
 */
function contextOf(messages) {
  const last = messages[messages.length - 1]
  if (!last) return 0
  const u = last.usage ?? {}
  return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
}

/**
 * Parsed assistant messages for one transcript, reading only the bytes appended since the last
 * refresh. Messages are keyed by id (a streaming message repeats its id across lines and only
 * the last line carries final usage — same rule as tools/ledger/transcript.mjs), so a later
 * line overwrites an earlier one for free. Returns [] on any read error.
 */
function messagesOf(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return []
  }
  const key = path.resolve(file)
  seen.add(key)
  const prev = cache[key]
  // A file that shrank was rotated or cleared; its cached offset is meaningless.
  const reusable = prev && prev.size <= stat.size ? prev : null
  const byId = new Map(Object.entries(reusable?.messages ?? {}))
  const from = reusable?.size ?? 0

  let chunk = ''
  if (stat.size > from) {
    try {
      const fd = fs.openSync(file, 'r')
      const buf = Buffer.alloc(stat.size - from)
      fs.readSync(fd, buf, 0, buf.length, from)
      fs.closeSync(fd)
      chunk = buf.toString('utf8')
    } catch {
      return [...byId.values()]
    }
  }
  // Only consume up to the last newline: the tail may be a half-written line mid-append.
  const cut = chunk.lastIndexOf('\n')
  const consumed = cut < 0 ? '' : chunk.slice(0, cut + 1)

  for (const line of consumed.split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== 'assistant') continue
    const msg = entry.message
    if (!msg?.id || !msg.usage) continue
    const usage = {}
    for (const k of USAGE_KEYS) usage[k] = msg.usage[k] ?? 0
    byId.set(msg.id, { id: msg.id, model: msg.model ?? 'unknown', usage, timestamp: byId.get(msg.id)?.timestamp ?? entry.timestamp })
  }

  cache[key] = { size: from + Buffer.byteLength(consumed, 'utf8'), messages: Object.fromEntries(byId) }
  return [...byId.values()]
}

/** Every .jsonl under `dir`, at any depth — a dynamic workflow nests agents one level deeper. */
function collectJsonl(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...collectJsonl(full))
    else if (e.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

/** `explore x2 verifier` from the sibling agent-<id>.meta.json files, when they exist. */
function tallyTypes(files) {
  const counts = {}
  for (const f of files) {
    const type = readJson(f.replace(/\.jsonl$/, '.meta.json'))?.agentType
    if (type) counts[type] = (counts[type] ?? 0) + 1
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => (n > 1 ? `${t} x${n}` : t))
  return parts.join(' ')
}

/**
 * Newest session transcript for `dir` under ~/.claude/projects, for standalone runs with no
 * stdin payload. Claude Code slugs a project path by replacing each of : \ / _ with a dash.
 */
function newestTranscript(dir) {
  const slug = path.resolve(dir).replace(/[:\\/_]/g, '-')
  const root = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'projects', slug)
  let entries
  try {
    entries = fs.readdirSync(root).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return null
  }
  return entries.map((f) => path.join(root, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null
}

/** Drops entries for transcripts not touched this run, then persists the cache. */
function writeCache() {
  for (const key of Object.keys(cache)) if (!seen.has(key)) delete cache[key]
  try {
    fs.mkdirSync(runsDir, { recursive: true })
    fs.writeFileSync(path.join(runsDir, '.statusline-cache.json'), JSON.stringify(cache))
  } catch {}
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function compact(n) {
  const v = Number(n ?? 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(v)
}

function usd(n) {
  return '$' + Number(n ?? 0).toFixed(Number(n ?? 0) >= 1 ? 2 : 3)
}

function pctStr(p) {
  return Math.round(p * 100) + '%'
}

function bar(p) {
  const filled = Math.max(0, Math.min(10, Math.round(p * 10)))
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function ctxColor(p) {
  const code = p >= 0.85 ? '31' : p >= 0.6 ? '33' : '32'
  return (s) => c(s, code)
}

function c(s, code) {
  if (process.env.STATUSLINE_NO_COLOR === '1' || process.env.NO_COLOR) return s
  return `[${code}m${s}[0m`
}

function shortModel(m) {
  return String(m ?? '?').replace(/^claude-/, '').replace(/-\d{8}$/, '')
}
