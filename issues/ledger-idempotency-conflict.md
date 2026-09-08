# Issue C — ledger: a reused `idempotencyKey` with a different body silently returns the first transfer

**Service:** `ledger/` · **Function:** `transfer()` (`ledger/src/ledger.ts`) · **Route:** `POST /transfer` (`ledger/src/app.ts`)

## Symptom

A client posted a transfer of 1,000 cents with key `ord_77`, then posted 2,500 cents with the
same key by mistake. The second call returned `201` with the *first* entry (1,000 cents).
Treasury reconciled 2,500 against a 1,000-cent movement. Nothing in the response said the two
requests disagreed.

## Acceptance criteria

1. An identical retry (same key, same `from`, `to`, `amountCents`) still returns the original
   entry and moves money exactly once. This is today's behaviour and must be kept.
2. A request whose `idempotencyKey` was already used with a **different** `from`, **or** a
   different `to`, **or** a different `amountCents` is rejected: `transfer()` throws an error with
   `status = 409`, and `POST /transfer` responds `409`.
3. A rejected reuse moves **no** money: both balances are unchanged and no new entry is
   recorded — the second request must not be posted under a new key, a composite key, or any
   other name.
4. Existing tests in `ledger/tests/` keep passing; add tests for 2 and 3.

## Out of scope

Authentication on `/transfer`, currency rules, and any other service.
