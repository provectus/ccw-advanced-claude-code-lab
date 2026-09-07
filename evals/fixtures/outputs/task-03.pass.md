high payments/src/app.ts:20 — PII or card data in logs — console.log writes the full card number and CVV for every payout, which lands in the service logs.
