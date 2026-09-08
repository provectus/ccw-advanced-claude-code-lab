// Hidden tests for issue A (issues/payments-duplicate-payouts.md). Test names carry the
// criterion number so `npm run grade` prints which one a fix missed.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../payments/src/app'
import { resetPayouts } from '../payments/src/payouts'

let server: Server
let base: string

beforeAll(async () => {
  server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => resetPayouts())

const body = { accountId: 'acc_1', amountCents: 1000, currency: 'MXN' }

const post = (payload: Record<string, unknown>) =>
  fetch(`${base}/payouts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok_ops' },
    body: JSON.stringify(payload),
  })

const pendingTotal = async () => {
  const res = await fetch(`${base}/payouts/summary?currency=MXN`, { headers: { authorization: 'Bearer tok_analyst' } })
  return ((await res.json()) as { pendingTotalCents: number }).pendingTotalCents
}

describe('issue A — POST /payouts idempotency', () => {
  it('A2 same key + same body returns the original payout and counts it once', async () => {
    const first = await post({ ...body, idempotencyKey: 'ord_1' })
    const second = await post({ ...body, idempotencyKey: 'ord_1' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const a = (await first.json()) as { id: string }
    const b = (await second.json()) as { id: string }
    expect(b.id).toBe(a.id)
    expect(await pendingTotal()).toBe(1000)
  })

  it('A3 same key + different body is rejected with 409 and creates nothing', async () => {
    expect((await post({ ...body, idempotencyKey: 'ord_2' })).status).toBe(201)
    const conflict = await post({ ...body, amountCents: 2500, idempotencyKey: 'ord_2' })
    expect(conflict.status).toBe(409)
    expect(await pendingTotal()).toBe(1000)
  })

  it('A4 different keys with the same body are two payouts', async () => {
    const a = (await (await post({ ...body, idempotencyKey: 'ord_3' })).json()) as { id: string }
    const b = (await (await post({ ...body, idempotencyKey: 'ord_4' })).json()) as { id: string }
    expect(b.id).not.toBe(a.id)
    expect(await pendingTotal()).toBe(2000)
  })

  it('A5 a request without a key still creates a payout every time', async () => {
    expect((await post(body)).status).toBe(201)
    expect((await post(body)).status).toBe(201)
    expect(await pendingTotal()).toBe(2000)
  })
})
