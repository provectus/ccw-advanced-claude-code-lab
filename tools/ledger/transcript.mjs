// Shared transcript parsing/summarizing for the token ledger hook and its one-off tools.

import fs from 'node:fs'
import path from 'node:path'
import { estimateUsd } from './pricing.mjs'

/**
 * Recursively searches `dir` for a file named `name` (depth-first, first match wins).
 * Used by hook.mjs and dedupe.mjs to locate a sub-agent's own transcript under a session's
 * subagents/ directory without assuming a flat layout: a direct spawn writes
 * subagents/agent-<id>.jsonl, but a dynamically-spawned workflow sub-agent nests one
 * directory deeper as subagents/workflows/<workflow-id>/agent-<id>.jsonl (and, conceivably,
 * deeper still). There is exactly one real transcript per agent id for its whole lifetime,
 * so the first match found is safe. Returns null if `dir` doesn't exist or has no match.
 */
export function findFile(dir, name) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

/**
 * Reads a transcript .jsonl file and returns one entry per distinct assistant message id.
 * A message that streams (thinking, then tool_use, then text) repeats the same id across
 * lines; only the last line carries the final usage, but the first line is when the message
 * actually started, so the earliest timestamp is kept while the latest usage/model wins.
 */
export function parseTranscript(file) {
  const byId = new Map()
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    let entry
    try {
      entry = JSON.parse(rawLine)
    } catch {
      continue
    }
    if (entry.type !== 'assistant') continue
    const msg = entry.message
    if (!msg?.id || !msg.usage) continue
    const usage = { ...msg.usage, thinking_tokens: msg.usage.output_tokens_details?.thinking_tokens ?? 0 }
    const timestamp = byId.get(msg.id)?.timestamp ?? entry.timestamp
    byId.set(msg.id, { id: msg.id, model: msg.model ?? 'unknown', usage, timestamp })
  }
  return [...byId.values()]
}

/** Sums usage/pricing across a list of parsed messages (see parseTranscript). */
export function summarizeMessages(messages) {
  const totals = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, thinking_tokens: 0 }
  const perModel = {}
  let estUsd = 0
  let assumed = false
  for (const m of messages) {
    for (const k of Object.keys(totals)) totals[k] += m.usage[k] ?? 0
    const pm = (perModel[m.model] ??= { messages: 0, input_tokens: 0, output_tokens: 0, est_usd: 0 })
    pm.messages += 1
    pm.input_tokens += (m.usage.input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0)
    pm.output_tokens += m.usage.output_tokens ?? 0
    const est = estimateUsd(m.model, m.usage)
    pm.est_usd += est.usd
    estUsd += est.usd
    assumed ||= est.assumed
  }
  for (const pm of Object.values(perModel)) pm.est_usd = round(pm.est_usd)
  const primaryModel = Object.entries(perModel).sort((a, b) => b[1].output_tokens - a[1].output_tokens)[0]?.[0] ?? 'unknown'
  const first = messages[0]
  const last = messages[messages.length - 1]
  return {
    model: primaryModel,
    models: perModel,
    messages: messages.length,
    ...totals,
    total_tokens: totals.input_tokens + totals.cache_creation_input_tokens + totals.cache_read_input_tokens + totals.output_tokens,
    first_ts: first?.timestamp ?? null,
    last_ts: last?.timestamp ?? null,
    duration_ms: first?.timestamp && last?.timestamp ? Math.max(0, Date.parse(last.timestamp) - Date.parse(first.timestamp)) : null,
    est_usd: round(estUsd),
    assumed,
  }
}

export function round(n) {
  return Math.round(n * 1_000_000) / 1_000_000
}
