// Hidden tests for issue C (issues/ledger-idempotency-conflict.md). Test names carry the
// criterion number so `npm run grade` prints which one a fix missed.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../ledger/src/app'
import { getAccount, listEntries, openAccount, resetLedger, transfer } from '../ledger/src/ledger'

beforeEach(() => {
  resetLedger()
  openAccount('acc_a', 'MXN', 10_000)
  openAccount('acc_b', 'MXN', 0)
  openAccount('acc_c', 'MXN', 0)
})

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn()
    return undefined
  } catch (err) {
    return (err as { status?: number })?.status
  }
}

describe('issue C — idempotency key reuse with a different body', () => {
  it('C1 an identical retry returns the original entry and moves money once', () => {
    const first = transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_77' })
    const second = transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_77' })
    expect(second.id).toBe(first.id)
    expect(getAccount('acc_a')?.balanceCents).toBe(9_000)
    expect(listEntries('acc_a')).toHaveLength(1)
  })

  it('C2 a reused key with a different amount throws with status 409', () => {
    transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_78' })
    expect(statusOf(() => transfer({ from: 'acc_a', to: 'acc_b', amountCents: 2_500, idempotencyKey: 'ord_78' }))).toBe(409)
  })

  it('C2 a reused key with a different destination throws with status 409', () => {
    transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_79' })
    expect(statusOf(() => transfer({ from: 'acc_a', to: 'acc_c', amountCents: 1_000, idempotencyKey: 'ord_79' }))).toBe(409)
  })

  it('C3 a rejected reuse moves no money and records no entry', () => {
    transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_80' })
    statusOf(() => transfer({ from: 'acc_a', to: 'acc_c', amountCents: 2_500, idempotencyKey: 'ord_80' }))
    expect(getAccount('acc_a')?.balanceCents).toBe(9_000)
    expect(getAccount('acc_b')?.balanceCents).toBe(1_000)
    expect(getAccount('acc_c')?.balanceCents).toBe(0)
    expect(listEntries('acc_a')).toHaveLength(1)
    expect(listEntries('acc_c')).toHaveLength(0)
  })
})

describe('issue C — POST /transfer', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  const post = (payload: Record<string, unknown>) =>
    fetch(`${base}/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok_treasury' },
      body: JSON.stringify(payload),
    })

  it('C2 the route answers 409 to a reused key with a different amount', async () => {
    expect((await post({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'ord_81' })).status).toBe(201)
    expect((await post({ from: 'acc_a', to: 'acc_b', amountCents: 2_500, idempotencyKey: 'ord_81' })).status).toBe(409)
    expect(getAccount('acc_a')?.balanceCents).toBe(9_000)
  })
})
