import type { NextFunction, Request, Response } from 'express'

export interface Principal {
  sub: string
  scopes: string[]
}

export class AuthError extends Error {
  status = 401
}

export class ForbiddenError extends Error {
  status = 403
}

const PRINCIPALS: Record<string, string[]> = {
  treasury: ['ledger:read', 'ledger:write'],
  reporting: ['ledger:read'],
}

/** Tokens look like `tok_<principal>`. Anything else is rejected. */
export function verifyToken(token: string | undefined): Principal {
  if (!token || !token.startsWith('tok_')) throw new AuthError('invalid token')
  const sub = token.slice(4)
  const scopes = PRINCIPALS[sub]
  if (!scopes) throw new AuthError('unknown principal')
  return { sub, scopes }
}

function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined
}

/** Express middleware: authenticates the bearer token and checks one scope. */
export function requireAuth(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const principal = verifyToken(bearer(req.get('authorization')))
      if (!principal.scopes.includes(scope)) throw new ForbiddenError(`missing scope ${scope}`)
      ;(req as Request & { principal?: Principal }).principal = principal
      next()
    } catch (err) {
      next(err)
    }
  }
}
