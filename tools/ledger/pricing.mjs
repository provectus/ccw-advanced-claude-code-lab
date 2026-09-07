import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PRICES = JSON.parse(fs.readFileSync(path.join(here, 'prices.json'), 'utf8'))

/** Maps a model id to a price family; `assumed` is true when the family was guessed. */
export function familyOf(model) {
  const m = String(model ?? '').toLowerCase()
  for (const family of Object.keys(PRICES.per_million)) {
    if (m.includes(family)) return { family, assumed: false }
  }
  return { family: PRICES.default_family, assumed: true }
}

/** Estimated USD for one usage block on one model. */
export function estimateUsd(model, usage) {
  const { family, assumed } = familyOf(model)
  const p = PRICES.per_million[family]
  const input = usage.input_tokens ?? 0
  const cacheCreate = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const usd =
    (input * p.input +
      cacheCreate * p.input * PRICES.cache_creation_multiplier +
      cacheRead * p.input * PRICES.cache_read_multiplier +
      output * p.output) /
    1_000_000
  return { usd, family, assumed }
}
