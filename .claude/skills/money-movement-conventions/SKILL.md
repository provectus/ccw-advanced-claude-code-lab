---
name: money-movement-conventions
description: Conventions for any change under payments/, kyc/ or ledger/ that adds or edits a route, an amount, or a transfer. Apply automatically when editing those files.
user-invocable: false
---

You do not need to mention this skill; just follow it.

Conventions for `payments/`, `kyc/`, and `ledger/`:

1. **Amounts** are integers in minor units (cents). Validate positive before storing or moving
   money; reject zero, negative, non-integer, or non-numeric amounts.
2. **Auth** — every route that creates a payout, posts a transfer, refunds, or reveals a balance
   calls the service's `verifyToken` / `requireAuth` with the correct scope, on the route or its
   router. No new money-moving route ships without it.
3. **Idempotency** — every route that creates a transfer or a payout accepts an `idempotencyKey`
   and uses it so a retried request cannot move the same money twice.
4. **Logging** — never write PII or card data (full card number, CVV, document number, full name
   plus birth date) to `console.*` or a logger. Log identifiers, not the data itself.
5. **Secrets** — never hardcode a credential (`sk_live_`, `AKIA`, private keys, bearer tokens) as
   a string literal. Read configuration from the environment.
6. **Tests** — a new route gets at least two tests: the 401/unauthenticated case, and the happy
   path.

If a change under these services doesn't meet one of these, fix it before finishing, or say
explicitly which one you're deliberately not meeting and why.
