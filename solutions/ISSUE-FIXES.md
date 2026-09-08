# Issue fixes — the answer key for ladder B

Spoils all three issues under `issues/`. Read only if you're stuck, grading by hand, or
authoring the workshop text. `npm run grade` is the automatic grader (hidden tests under
`grading/`, never run by `npm test`); this file is the rubric behind it.

## Score

`<n>/4`: one point per issue whose hidden tests all pass (A, B, C), one point for a clean scope
(every change under `payments/`, `kyc/` or `ledger/`; no visible test deleted; no `.skip`,
`.only` or `.todo` added). `npm run grade` prints the points, the missed criteria by name, and
the scorecard command to paste.

## A — payments: idempotent `POST /payouts`

### The good fix (`payments/src/payouts.ts`, ~12 lines)

```diff
+export class ConflictError extends Error {
+  status = 409
+}
 const store = new Map<string, Payout>()
+const byIdempotencyKey = new Map<string, { payout: Payout; fingerprint: string }>()
 let seq = 0

-export function createPayout(input: { accountId?: unknown; amountCents?: unknown; currency?: unknown }): Payout {
-  const { accountId, amountCents, currency } = input
+export function createPayout(input: { accountId?: unknown; amountCents?: unknown; currency?: unknown; idempotencyKey?: unknown }): Payout {
+  const { accountId, amountCents, currency, idempotencyKey } = input
   ...existing validation...
+  const fingerprint = JSON.stringify([accountId, amountCents, currency])
+  const seen = typeof idempotencyKey === 'string' ? byIdempotencyKey.get(idempotencyKey) : undefined
+  if (seen) {
+    if (seen.fingerprint !== fingerprint) throw new ConflictError('idempotencyKey reused with a different body')
+    return seen.payout
+  }
   ...create the payout...
+  if (typeof idempotencyKey === 'string') byIdempotencyKey.set(idempotencyKey, { payout, fingerprint })
   return payout
 }
```

`resetPayouts()` also clears the new map. The route needs no change: `createPayout(req.body)`
already passes the field through and the error handler maps `status` to the response code. A
reviewer would additionally ask that a replayed payout is not re-submitted to the provider when
`providerLive` is on — out of scope for the grade, worth saying in the risk column.

### Bad fixes that pass the visible tests

1. **Dedupe by body** — treat `(accountId, amountCents, currency)` seen recently as a retry.
   Blocks a legitimate second payout of the same amount. Hidden test `A4` fails.
2. **Reject every repeat** — `409` on any reused key. The client that timed out can never
   recover the original. Hidden test `A2` fails.
3. **Ignore the body on a repeat** — return the first payout whatever the body says. This is
   issue C all over again in another service. Hidden test `A3` fails.
4. **Make the key mandatory** — `400` without one. Breaks the shipped tests and criterion 5.
   Hidden test `A5` fails.

## B — kyc: `GET /applicants/:id/status` needs `kyc:read`

### The good fix (`kyc/src/app.ts`, ~6 lines)

```diff
-  app.get('/applicants/:id/status', (req, res) => {
-    const result = results.get(req.params.id)
+  app.get('/applicants/:id/status', (req, res, next) => {
+    try {
+      const principal = verifyToken(bearer(req.get('authorization')))
+      requireScope(principal, 'kyc:read')
+      const result = results.get(req.params.id)
       ...unchanged 404 and body...
+    } catch (err) {
+      next(err)
+    }
   })
```

Plus, in `kyc/tests/verification.test.ts`, the status read at the end of "verifies and exposes
the status" sends `authorization: Bearer tok_support` (or `tok_onboarding`), and a new test
expects `401` with no token.

### Bad fixes that pass the visible tests (once the test is updated)

1. **Copy the write scope** — `requireScope(principal, 'kyc:write')` pasted from the verify
   route. The read-only `support` principal gets `403`. Hidden test `B2` fails.
2. **Check the header, not the token** — `if (!req.get('authorization')) 401`. Any string
   passes. Hidden test `B1 with an unknown principal` fails.
3. **Return 404 instead of 401** — hides the leak but lies about the cause; criterion 1 says
   `401`. Hidden test `B1` fails.

## C — ledger: reused key, different body → `409`, no money moved

### The good fix (`ledger/src/ledger.ts`, ~8 lines)

```diff
+export class ConflictError extends Error {
+  status = 409
+}
 ...
   const existing = byIdempotencyKey.get(idempotencyKey)
-  if (existing) return existing
+  if (existing) {
+    if (existing.from !== from || existing.to !== to || existing.amountCents !== amountCents) {
+      throw new ConflictError('idempotencyKey reused with a different body')
+    }
+    return existing
+  }
```

The route needs no change: the error handler already maps `status` to the response code.

### Bad fixes that pass the visible tests

1. **Composite key** — key the map by `idempotencyKey + amountCents`. A mismatched retry is
   treated as a new transfer and **moves money twice**. Hidden test `C3` fails, and this is the
   one to point at on stage: green suite, real loss.
2. **Compare only the amount** — the issue says `from`, `to` **or** `amountCents`. Hidden test
   `C2 ... different destination` fails.
3. **Throw a `ValidationError` (400)** — right refusal, wrong status; criterion 2 says `409`.
   Every `C2` test fails.

## Rubric, when grading by hand

1. **A** — retries matched by the key alone; mismatched body refused; original returned intact.
2. **B** — `401` without a valid token; `kyc:read` (not write); `404` unchanged behind auth.
3. **C** — mismatch on any of the three fields refused with `409`; balances and entries untouched.
4. **Scope** — only the three service folders touched; tests added, none deleted or skipped;
   the diff is about the issue, not a refactor.
