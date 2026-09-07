import _ from 'lodash'
import { config, type Currency } from './config'

export interface Payout {
  id: string
  accountId: string
  amountCents: number
  currency: Currency
  status: 'pending' | 'submitted' | 'settled'
  createdAt: string
}

export class ValidationError extends Error {
  status = 400
}

const store = new Map<string, Payout>()
let seq = 0

export function createPayout(input: { accountId?: unknown; amountCents?: unknown; currency?: unknown }): Payout {
  const { accountId, amountCents, currency } = input
  if (typeof accountId !== 'string' || accountId.length === 0) throw new ValidationError('accountId required')
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('amountCents must be a positive integer')
  }
  if (typeof currency !== 'string' || !(config.supportedCurrencies as readonly string[]).includes(currency)) {
    throw new ValidationError(`currency must be one of ${config.supportedCurrencies.join(', ')}`)
  }
  seq += 1
  const payout: Payout = {
    id: `po_${String(seq).padStart(6, '0')}`,
    accountId,
    amountCents,
    currency: currency as Currency,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  store.set(payout.id, payout)
  return payout
}

export function getPayout(id: string): Payout | undefined {
  return store.get(id)
}

export function listPayouts(accountId?: string): Payout[] {
  const all = [...store.values()]
  return accountId ? all.filter((p) => p.accountId === accountId) : all
}

export function pendingTotalCents(currency: Currency): number {
  return _.sumBy(
    listPayouts().filter((p) => p.status === 'pending' && p.currency === currency),
    (p) => p.amountCents,
  )
}

export function resetPayouts(): void {
  store.clear()
  seq = 0
}
