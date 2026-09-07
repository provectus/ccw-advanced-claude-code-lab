import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { getAccount, openAccount, resetLedger, transfer } from '../src/ledger'

beforeEach(() => {
  resetLedger()
  openAccount('acc_a', 'MXN', 10_000)
  openAccount('acc_b', 'MXN', 0)
  openAccount('acc_usd', 'USD', 0)
})

describe('transfer', () => {
  it('moves money between accounts', () => {
    const entry = transfer({ from: 'acc_a', to: 'acc_b', amountCents: 2_500, idempotencyKey: 'k1' })
    expect(entry.amountCents).toBe(2_500)
    expect(getAccount('acc_a')?.balanceCents).toBe(7_500)
    expect(getAccount('acc_b')?.balanceCents).toBe(2_500)
  })

  it('rejects insufficient funds', () => {
    expect(() => transfer({ from: 'acc_b', to: 'acc_a', amountCents: 1, idempotencyKey: 'k2' })).toThrow('insufficient funds')
  })

  it('rejects a currency mismatch', () => {
    expect(() => transfer({ from: 'acc_a', to: 'acc_usd', amountCents: 1, idempotencyKey: 'k3' })).toThrow('currency mismatch')
  })

  it('is idempotent on the key', () => {
    const first = transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'same' })
    const second = transfer({ from: 'acc_a', to: 'acc_b', amountCents: 1_000, idempotencyKey: 'same' })
    expect(second.id).toBe(first.id)
    expect(getAccount('acc_a')?.balanceCents).toBe(9_000)
  })
})

describe('routes', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('requires a token to read a balance', async () => {
    expect((await fetch(`${base}/accounts/acc_a/balance`)).status).toBe(401)
  })

  it('reads a balance with a reporting token', async () => {
    const res = await fetch(`${base}/accounts/acc_a/balance`, { headers: { authorization: 'Bearer tok_reporting' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { balanceCents: number }).balanceCents).toBe(10_000)
  })

  it('validates a transfer body', async () => {
    const res = await fetch(`${base}/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok_treasury' },
      body: JSON.stringify({ from: 'acc_a', to: 'acc_a', amountCents: 5, idempotencyKey: 'r1' }),
    })
    expect(res.status).toBe(400)
  })
})
