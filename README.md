# ccw-advanced-claude-code-lab

Three small money-movement services: payout creation and lookup, applicant verification, and a
shared ledger. TypeScript on Node 20+, npm workspaces, Express 5, Vitest, and `tsx` — no build
step. Each service owns its `src/`, `tests/`, and `package.json` dependencies; nothing is shared
between services on purpose.

## Services

| Folder      | Purpose                        | Dev port | Routes |
|-------------|---------------------------------|----------|--------|
| `payments/` | Payout creation and lookup     | 4001     | `GET /health`, `POST /payouts`, `GET /payouts/summary`, `GET /payouts/:id`, `GET /accounts/:accountId/payouts` |
| `kyc/`      | Applicant verification rules   | 4002     | `GET /health`, `POST /applicants/:id/verify`, `GET /applicants/:id/status` |
| `ledger/`   | Accounts, balances, transfers  | 4003     | `GET /health`, `POST /accounts`, `GET /accounts/:id/balance`, `GET /accounts/:id/entries`, `POST /transfer` |

Auth is a bearer token: `payments` and `kyc` check it per-route via `verifyToken`; `ledger`
checks it through its `requireAuth` middleware.

## Architecture

Three independent Express apps, one per folder, each with its own in-memory store, its own
copy of the token check, and its own tests. No service calls another — a caller talks to each
one directly. The only outbound call is `payments` → the payout provider, and only when
`PROVIDER_LIVE` is on.

```mermaid
flowchart LR
    client([Caller<br/>Bearer tok_&lt;principal&gt;])

    subgraph payments ["payments/  :4001"]
        direction TB
        pAuth["auth.ts<br/>verifyToken + requireScope<br/>scopes: payouts:read, payouts:write"]
        pRoutes["app.ts<br/>POST /payouts<br/>GET /payouts/summary<br/>GET /payouts/:id<br/>GET /accounts/:id/payouts"]
        pStore[("payouts.ts<br/>Map&lt;id, Payout&gt;")]
        pProv["provider.ts<br/>submitToProvider"]
        pRoutes --> pAuth
        pRoutes --> pStore
        pRoutes -. PROVIDER_LIVE .-> pProv
    end

    subgraph kyc ["kyc/  :4002"]
        direction TB
        kAuth["auth.ts<br/>verifyToken + requireScope<br/>scopes: kyc:read, kyc:write"]
        kRoutes["app.ts<br/>POST /applicants/:id/verify<br/>GET /applicants/:id/status"]
        kRules["verification.ts<br/>parseApplicant → runChecks → evaluate"]
        kStore[("results<br/>Map&lt;applicantId, CheckResult&gt;")]
        kRoutes --> kAuth
        kRoutes --> kRules
        kRoutes --> kStore
    end

    subgraph ledger ["ledger/  :4003"]
        direction TB
        lAuth["auth.ts<br/>requireAuth(scope) middleware<br/>scopes: ledger:read, ledger:write"]
        lRoutes["app.ts<br/>POST /accounts<br/>GET /accounts/:id/balance<br/>GET /accounts/:id/entries<br/>POST /transfer"]
        lStore[("ledger.ts<br/>accounts · entries · byIdempotencyKey")]
        lRoutes --> lAuth
        lRoutes --> lStore
    end

    provider[/"External payout provider"/]

    client --> pRoutes
    client --> kRoutes
    client --> lRoutes
    pProv --> provider
```

Every service follows the same file layout, so one agent can own one folder without reading the
others:

```mermaid
flowchart LR
    server["server.ts<br/>listen on the dev port"] --> app["app.ts<br/>createApp(): routes + error handler"]
    app --> auth["auth.ts<br/>token → Principal { sub, scopes }"]
    app --> domain["domain module<br/>payouts.ts / verification.ts / ledger.ts<br/>validation + in-memory store"]
    tests["tests/*.test.ts<br/>createApp().listen(0) + fetch"] --> app
```

Principals are fixed per service (`tok_ops`, `tok_analyst` · `tok_onboarding`, `tok_support` ·
`tok_treasury`, `tok_reporting`); amounts are integers in cents; a transfer carries an
`idempotencyKey` so a retry cannot move money twice. The conventions behind those choices live in
`.claude/skills/money-movement-conventions/SKILL.md`.

## Getting started

Requires Node 20+.

```bash
npm install                 # once, at the root
npm test                    # all three services
npm test -w kyc             # one service (also: npm run test:kyc)
npm run dev:payments        # start one service
npm run test:stable         # excludes one test that's flaky by design
npm run check               # repo self-check
```

## Repo layout

- `payments/`, `kyc/`, `ledger/` — the three services, each with its own `src/`, `tests/`, and dependencies
- `.claude/` — skills, agents, and hooks Claude Code uses in this repo
- `evals/` — an eval kit for one of the skills
- `issues/`, `grading/` — three issue files (one per service) and the hidden tests that grade a fix
- `tools/` — a token-usage ledger, a status line, a scorecard, and a repo self-check
- `build-it/`, `solutions/` — a bonus build track and its finished reference

## This repo doubles as a workshop

This repo is also the reference repo for the Advanced Claude Code workshop. A few things are
wrong on purpose — one test is flaky by design — so an attendee can practice finding and fixing
real defects with Claude Code. Read [CASE.md](CASE.md) for the story and
[WORKSHOP.md](WORKSHOP.md) for the full workshop guide.

`CLAUDE.md` holds the rules Claude Code reads at every session start.
