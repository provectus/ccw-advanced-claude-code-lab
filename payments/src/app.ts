import express, { type NextFunction, type Request, type Response } from 'express'
import { bearer, requireScope, verifyToken } from './auth'
import { config } from './config'
import { createPayout, getPayout, listPayouts, pendingTotalCents } from './payouts'
import { submitToProvider } from './provider'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'payments' })
  })

  app.post('/payouts', async (req, res, next) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      requireScope(principal, 'payouts:write')
      const payout = createPayout(req.body ?? {})
      if (config.providerLive) {
        const { providerRef } = await submitToProvider(payout)
        payout.status = 'submitted'
        console.log(`payout ${payout.id} submitted as ${providerRef}`)
      }
      res.status(201).json(payout)
    } catch (err) {
      next(err)
    }
  })

  app.get('/payouts/summary', (req, res, next) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      requireScope(principal, 'payouts:read')
      const currency = String(req.query.currency ?? 'MXN')
      const supported = config.supportedCurrencies as readonly string[]
      if (!supported.includes(currency)) {
        res.status(400).json({ error: 'unsupported currency' })
        return
      }
      res.json({ currency, pendingTotalCents: pendingTotalCents(currency as (typeof config.supportedCurrencies)[number]) })
    } catch (err) {
      next(err)
    }
  })

  app.get('/payouts/:id', (req, res, next) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      requireScope(principal, 'payouts:read')
      const payout = getPayout(req.params.id)
      if (!payout) {
        res.status(404).json({ error: 'not found' })
        return
      }
      res.json(payout)
    } catch (err) {
      next(err)
    }
  })

  app.get('/accounts/:accountId/payouts', (req, res, next) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      requireScope(principal, 'payouts:read')
      res.json(listPayouts(req.params.accountId))
    } catch (err) {
      next(err)
    }
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500
    const message = err instanceof Error ? err.message : 'internal error'
    if (status === 500) console.error(err)
    res.status(status).json({ error: message })
  })

  return app
}
