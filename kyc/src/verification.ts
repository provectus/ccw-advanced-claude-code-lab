import dayjs from 'dayjs'

export interface Applicant {
  id: string
  country: string
  documentType: 'passport' | 'national_id' | 'driver_license'
  birthDate: string
}

export interface Decision {
  status: 'approved' | 'review' | 'rejected'
  reasons: string[]
}

export interface CheckResult extends Decision {
  applicantId: string
  checkedAt: string
  elapsedMs: number
}

export class ValidationError extends Error {
  status = 400
}

const SUPPORTED_COUNTRIES = ['MX', 'AR', 'BR', 'CO', 'US']
const REVIEW_COUNTRIES = ['US']
const MIN_AGE = 18

export function evaluate(applicant: Applicant, now: dayjs.Dayjs = dayjs()): Decision {
  const reasons: string[] = []
  if (!SUPPORTED_COUNTRIES.includes(applicant.country)) reasons.push('unsupported country')

  const birth = dayjs(applicant.birthDate)
  if (!birth.isValid()) reasons.push('invalid birth date')
  else if (now.diff(birth, 'year') < MIN_AGE) reasons.push('under minimum age')

  if (!['passport', 'national_id', 'driver_license'].includes(applicant.documentType)) reasons.push('invalid document type')

  if (reasons.length > 0) return { status: 'rejected', reasons }
  if (REVIEW_COUNTRIES.includes(applicant.country) || applicant.documentType === 'driver_license') {
    return { status: 'review', reasons: ['manual review required'] }
  }
  return { status: 'approved', reasons: [] }
}

/** Simulated document-provider round trip. */
function providerLatencyMs(): number {
  return 5 + Math.floor(Math.random() * 40)
}

export async function runChecks(applicant: Applicant): Promise<CheckResult> {
  const started = Date.now()
  await new Promise((resolve) => setTimeout(resolve, providerLatencyMs()))
  const decision = evaluate(applicant)
  return {
    applicantId: applicant.id,
    ...decision,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
  }
}

export function parseApplicant(id: string, body: Record<string, unknown>): Applicant {
  const { country, documentType, birthDate } = body
  if (typeof country !== 'string' || country.length !== 2) throw new ValidationError('country must be a 2-letter code')
  if (typeof documentType !== 'string') throw new ValidationError('documentType required')
  if (typeof birthDate !== 'string') throw new ValidationError('birthDate required')
  return { id, country: country.toUpperCase(), documentType: documentType as Applicant['documentType'], birthDate }
}
