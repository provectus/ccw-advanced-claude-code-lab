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
  ops: ['payouts:read', 'payouts:write'],
  analyst: ['payouts:read'],
}

/** Tokens look like `tok_<principal>`. Anything else is rejected. */
export function verifyToken(token: string | undefined): Principal {
  if (!token || !token.startsWith('tok_')) throw new AuthError('invalid token')
  const sub = token.slice(4)
  const scopes = PRINCIPALS[sub]
  if (!scopes) throw new AuthError('unknown principal')
  return { sub, scopes }
}

export function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined
}

export function requireScope(principal: Principal, scope: string): void {
  if (!principal.scopes.includes(scope)) throw new ForbiddenError(`missing scope ${scope}`)
}
