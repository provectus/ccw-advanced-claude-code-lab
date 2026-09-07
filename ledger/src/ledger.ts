import { v4 as uuid } from 'uuid'

export interface Account {
  id: string
  currency: string
  balanceCents: number
}

export interface Entry {
  id: string
  from: string
  to: string
  amountCents: number
  idempotencyKey: string
  postedAt: string
}

export class ValidationError extends Error {
  status = 400
}

export class InsufficientFundsError extends Error {
  status = 422
}

const accounts = new Map<string, Account>()
const entries: Entry[] = []
const byIdempotencyKey = new Map<string, Entry>()

export function openAccount(id: string, currency: string, openingBalanceCents = 0): Account {
  const account: Account = { id, currency, balanceCents: openingBalanceCents }
  accounts.set(id, account)
  return account
}

export function getAccount(id: string): Account | undefined {
  return accounts.get(id)
}

export function transfer(input: { from?: unknown; to?: unknown; amountCents?: unknown; idempotencyKey?: unknown }): Entry {
  const { from, to, amountCents, idempotencyKey } = input
  if (typeof from !== 'string' || typeof to !== 'string') throw new ValidationError('from and to required')
  if (from === to) throw new ValidationError('from and to must differ')
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('amountCents must be a positive integer')
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new ValidationError('idempotencyKey required')

  const existing = byIdempotencyKey.get(idempotencyKey)
  if (existing) return existing

  const source = accounts.get(from)
  const target = accounts.get(to)
  if (!source || !target) throw new ValidationError('unknown account')
  if (source.currency !== target.currency) throw new ValidationError('currency mismatch')
  if (source.balanceCents < amountCents) throw new InsufficientFundsError('insufficient funds')

  source.balanceCents -= amountCents
  target.balanceCents += amountCents
  const entry: Entry = { id: uuid(), from, to, amountCents, idempotencyKey, postedAt: new Date().toISOString() }
  entries.push(entry)
  byIdempotencyKey.set(idempotencyKey, entry)
  return entry
}

export function listEntries(accountId: string): Entry[] {
  return entries.filter((e) => e.from === accountId || e.to === accountId)
}

export function resetLedger(): void {
  accounts.clear()
  entries.length = 0
  byIdempotencyKey.clear()
}
