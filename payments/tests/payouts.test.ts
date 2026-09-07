import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { resetPayouts } from '../src/payouts'

let server: Server
let base: string

beforeAll(async () => {
  server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => resetPayouts())

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
})

describe('POST /payouts', () => {
  it('rejects a request without a token', async () => {
    const res = await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: 1000, currency: 'MXN' }))
    expect(res.status).toBe(401)
  })

  it('rejects a principal without the write scope', async () => {
    const res = await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: 1000, currency: 'MXN' }, 'tok_analyst'))
    expect(res.status).toBe(403)
  })

  it('creates a payout for ops and reads it back', async () => {
    const created = await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: 1000, currency: 'MXN' }, 'tok_ops'))
    expect(created.status).toBe(201)
    const payout = (await created.json()) as { id: string; status: string }
    expect(payout.status).toBe('pending')

    const read = await fetch(`${base}/payouts/${payout.id}`, { headers: { authorization: 'Bearer tok_analyst' } })
    expect(read.status).toBe(200)
    expect(((await read.json()) as { id: string }).id).toBe(payout.id)
  })

  it('rejects a non-positive amount', async () => {
    const res = await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: -5, currency: 'MXN' }, 'tok_ops'))
    expect(res.status).toBe(400)
  })

  it('rejects an unsupported currency', async () => {
    const res = await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: 500, currency: 'EUR' }, 'tok_ops'))
    expect(res.status).toBe(400)
  })
})

describe('GET /payouts/summary', () => {
  it('sums pending payouts per currency', async () => {
    await fetch(`${base}/payouts`, json({ accountId: 'acc_1', amountCents: 1000, currency: 'MXN' }, 'tok_ops'))
    await fetch(`${base}/payouts`, json({ accountId: 'acc_2', amountCents: 2500, currency: 'MXN' }, 'tok_ops'))
    await fetch(`${base}/payouts`, json({ accountId: 'acc_2', amountCents: 9999, currency: 'USD' }, 'tok_ops'))
    const res = await fetch(`${base}/payouts/summary?currency=MXN`, { headers: { authorization: 'Bearer tok_analyst' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { pendingTotalCents: number }).pendingTotalCents).toBe(3500)
  })
})
