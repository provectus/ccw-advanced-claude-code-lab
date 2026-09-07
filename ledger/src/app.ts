import express, { type NextFunction, type Request, type Response } from 'express'
import { requireAuth } from './auth'
import { getAccount, listEntries, openAccount, transfer } from './ledger'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'ledger' })
  })

  app.post('/accounts', requireAuth('ledger:write'), (req, res) => {
    const { id, currency, openingBalanceCents } = req.body ?? {}
    if (typeof id !== 'string' || typeof currency !== 'string') {
      res.status(400).json({ error: 'id and currency required' })
      return
    }
    res.status(201).json(openAccount(id, currency, Number(openingBalanceCents ?? 0)))
  })

  app.get('/accounts/:id/balance', requireAuth('ledger:read'), (req, res) => {
    const account = getAccount(req.params.id)
    if (!account) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json({ id: account.id, currency: account.currency, balanceCents: account.balanceCents })
  })

  app.get('/accounts/:id/entries', requireAuth('ledger:read'), (req, res) => {
    res.json(listEntries(req.params.id))
  })

  app.post('/transfer', (req, res, next) => {
    try {
      res.status(201).json(transfer(req.body ?? {}))
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
