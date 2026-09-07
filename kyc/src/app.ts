import express, { type NextFunction, type Request, type Response } from 'express'
import { bearer, requireScope, verifyToken } from './auth'
import { parseApplicant, runChecks, type CheckResult } from './verification'

const results = new Map<string, CheckResult>()

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'kyc' })
  })

  app.post('/applicants/:id/verify', async (req, res, next) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      requireScope(principal, 'kyc:write')
      const applicant = parseApplicant(req.params.id, req.body ?? {})
      const result = await runChecks(applicant)
      results.set(applicant.id, result)
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  })

  app.get('/applicants/:id/status', (req, res) => {
    const result = results.get(req.params.id)
    if (!result) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json({ applicantId: result.applicantId, status: result.status, checkedAt: result.checkedAt })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500
    const message = err instanceof Error ? err.message : 'internal error'
    if (status === 500) console.error(err)
    res.status(status).json({ error: message })
  })

  return app
}

export function resetResults(): void {
  results.clear()
}
