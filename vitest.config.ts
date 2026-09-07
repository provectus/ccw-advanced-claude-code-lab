import { defineConfig } from 'vitest/config'

// Service tests only. The repo's own checks under tests/ run on node:test.
export default defineConfig({
  test: {
    include: [
      'payments/tests/**/*.test.ts',
      'kyc/tests/**/*.test.ts',
      'ledger/tests/**/*.test.ts',
    ],
  },
})
