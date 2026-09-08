import { defineConfig } from 'vitest/config'

// Hidden tests for the issue-resolution ladder. Deliberately NOT part of the root config's
// include list, so `npm test` never runs them; `npm run grade` runs them with this config.
export default defineConfig({
  test: {
    include: ['grading/**/*.hidden.test.ts'],
  },
})
