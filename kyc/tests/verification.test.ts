import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import dayjs from 'dayjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { evaluate } from '../src/verification'

const NOW = dayjs('2026-09-08')

describe('evaluate', () => {
  it('approves an adult with a passport from a supported country', () => {
    expect(evaluate({ id: 'a1', country: 'MX', documentType: 'passport', birthDate: '1990-05-01' }, NOW)).toEqual({
      status: 'approved',
      reasons: [],
    })
  })

  it('rejects a minor', () => {
    const d = evaluate({ id: 'a2', country: 'MX', documentType: 'passport', birthDate: '2012-05-01' }, NOW)
    expect(d.status).toBe('rejected')
    expect(d.reasons).toContain('under minimum age')
  })

  it('rejects an unsupported country', () => {
    const d = evaluate({ id: 'a3', country: 'FR', documentType: 'passport', birthDate: '1990-05-01' }, NOW)
    expect(d.status).toBe('rejected')
    expect(d.reasons).toContain('unsupported country')
  })

  it('sends US applicants to manual review', () => {
    expect(evaluate({ id: 'a4', country: 'US', documentType: 'passport', birthDate: '1990-05-01' }, NOW).status).toBe('review')
  })

  it('sends driver licenses to manual review', () => {
    expect(evaluate({ id: 'a5', country: 'MX', documentType: 'driver_license', birthDate: '1990-05-01' }, NOW).status).toBe('review')
  })
})

describe('POST /applicants/:id/verify', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createApp().listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('requires a token', async () => {
    const res = await fetch(`${base}/applicants/a9/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ country: 'MX', documentType: 'passport', birthDate: '1990-05-01' }),
    })
    expect(res.status).toBe(401)
  })

  it('verifies and exposes the status', async () => {
    const res = await fetch(`${base}/applicants/a9/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok_onboarding' },
      body: JSON.stringify({ country: 'MX', documentType: 'passport', birthDate: '1990-05-01' }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('approved')

    const status = await fetch(`${base}/applicants/a9/status`)
    expect(status.status).toBe(200)
    expect(((await status.json()) as { status: string }).status).toBe('approved')
  })
})
