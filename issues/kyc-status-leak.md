# Issue B — kyc: `GET /applicants/:id/status` reveals the decision without a token

**Service:** `kyc/` · **Route:** `GET /applicants/:id/status` (`kyc/src/app.ts`)

## Symptom

Anyone who can reach port 4002 can read whether an applicant was approved, sent to review, or
rejected, with no `Authorization` header at all. Every other read in the three services requires
a token with a read scope.

## Acceptance criteria

1. The route requires a bearer token. Without one, or with an unknown principal, it responds
   `401` and reveals nothing about the applicant.
2. The token needs the **`kyc:read`** scope — the read scope, not the write one. The `support`
   principal (read-only) must be able to read a status; `onboarding` (read and write) still can.
3. With a valid token, an applicant that was never verified is still `404`.
4. The response body for a verified applicant is unchanged: `applicantId`, `status`, `checkedAt`.
5. `kyc/tests/verification.test.ts` currently reads the status **without** a token and expects
   `200`. Update that test to send a token; add a test for the `401` case.

## Out of scope

The verify route, the decision rules in `verification.ts`, and any other service.
