import { describe, expect, it } from 'vitest'
import { runChecks } from '../src/verification'

const SLA_MS = 25

describe('verification SLA', () => {
  it(`completes an applicant check within ${SLA_MS}ms`, async () => {
    const result = await runChecks({ id: 'sla-1', country: 'MX', documentType: 'passport', birthDate: '1990-05-01' })
    expect(result.status).toBe('approved')
    expect(result.elapsedMs).toBeLessThanOrEqual(SLA_MS)
  })
})
