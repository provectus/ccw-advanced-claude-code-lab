// Hidden tests for issue B (issues/kyc-status-leak.md). Test names carry the criterion number
// so `npm run grade` prints which one a fix missed.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, resetResults } from '../kyc/src/app'

let server: Server
let base: string

beforeAll(async () => {
  server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => resetResults())

const verify = (id: string) =>
  fetch(`${base}/applicants/${id}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok_onboarding' },
    body: JSON.stringify({ country: 'MX', documentType: 'passport', birthDate: '1990-05-01' }),
  })

const status = (id: string, token?: string) =>
  fetch(`${base}/applicants/${id}/status`, { headers: token ? { authorization: `Bearer ${token}` } : {} })

describe('issue B — GET /applicants/:id/status auth', () => {
  it('B1 without a token the status is 401 and reveals nothing', async () => {
    expect((await verify('a1')).status).toBe(200)
    const res = await status('a1')
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).not.toContain('approved')
  })

  it('B1 with an unknown principal the status is 401', async () => {
    expect((await verify('a2')).status).toBe(200)
    expect((await status('a2', 'tok_nobody')).status).toBe(401)
  })

  it('B2 a read-only principal (support) can read the status', async () => {
    expect((await verify('a3')).status).toBe(200)
    const res = await status('a3', 'tok_support')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('approved')
  })

  it('B3 a never-verified applicant is 404 with a valid token', async () => {
    expect((await status('nobody', 'tok_support')).status).toBe(404)
  })

  it('B4 the body still carries applicantId, status and checkedAt', async () => {
    expect((await verify('a4')).status).toBe(200)
    const json = (await (await status('a4', 'tok_onboarding')).json()) as Record<string, unknown>
    expect(Object.keys(json).sort()).toEqual(['applicantId', 'checkedAt', 'status'])
    expect(json.applicantId).toBe('a4')
  })
})
