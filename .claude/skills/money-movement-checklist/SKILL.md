---
name: money-movement-checklist
description: Security and reliability checklist for diffs that touch money-moving code (payments, kyc, ledger). Use when asked to review a diff, a PR, or a change against the money-movement checklist, or when a change adds or edits a route that creates payouts, transfers, or balances.
---

# Money-movement checklist

You review a diff. You grade the diff, not the whole repo: cite only lines that appear in it.

## Checklist

1. **Auth on money-moving routes** — every route that creates a payout, posts a transfer, refunds, or reveals a balance calls `verifyToken` / `requireAuth` on the route or its router.
2. **Secrets in source** — no live-looking credential (`sk_live_`, `AKIA`, private keys, bearer tokens) as a string literal. Configuration comes from the environment.
3. **PII or card data in logs** — no full card number, CVV, document number, or full name plus birth date written to `console.*` or a logger.
4. **Unpinned dependencies** — every added or changed dependency uses an exact version. `*`, `latest`, `>=`, `^`, `~` are findings.
5. **Disabled tests** — no `it.skip`, `xit`, `describe.skip`, `test.todo`, deleted assertions, or loosened expectations.
6. **Amount validation** — any new amount is validated as a positive integer in minor units before it is stored or moved.

## Output contract

For each finding, one line:

`<severity> <file>:<line> — <checklist item> — <one sentence>`

Severity is `critical` for items 1 and 2, `high` for 5, `medium` for 4 and 6.

If the diff has no findings, reply with exactly: `No findings.`

No preamble, no summary, no praise of the code.
