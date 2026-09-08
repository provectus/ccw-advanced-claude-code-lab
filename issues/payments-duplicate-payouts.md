# Issue A — payments: a retried `POST /payouts` creates a second payout

**Service:** `payments/` · **Route:** `POST /payouts` (`payments/src/app.ts`) · **Store:** `payments/src/payouts.ts`

## Symptom

A client's request timed out after the server had already stored the payout. The client retried
with the same body and got a *second* `201` with a new `id`. Two payouts for one order are now
pending; the summary endpoint reports double the amount.

## Acceptance criteria

1. The request body accepts an optional string field `idempotencyKey`.
2. A request that repeats a previously seen `idempotencyKey` **with the same body** (`accountId`,
   `amountCents`, `currency`) returns `201` with the **original** payout — same `id`, identical
   JSON — and does not create a new one. The pending total counts that payout once.
3. A request that repeats a previously seen `idempotencyKey` **with a different body** is
   rejected with `409` and creates nothing.
4. Two requests with **different** keys and the same body are two payouts (retries are matched
   by the key, never by the body).
5. A request with no `idempotencyKey` behaves as today (`201`, a new payout every time).
6. Existing tests in `payments/tests/` keep passing; add tests for 2 and 3.

## Out of scope

Provider submission, the summary endpoint, and any other service.
