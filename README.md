# Pebble

A full-stack digital financial platform prototype built with Next.js 16 (App Router), TypeScript, PostgreSQL (Neon) + Drizzle ORM, Tailwind CSS, and Base UI (shadcn-style) components.

Pebble models a simplified fintech: **accounts**, **wallets**, **cards**, and an **atomic, idempotent money-transfer engine** with a transaction monitor that recovers interrupted transfers. It is a prototype, not production software — some money-movement authentic controls (e.g. KYC, card schemes) are intentionally omitted or stubbed.

## Features

- **Auth** — registration/login with Argon2id password hashing, HTTP-only session cookie (SHA-256 hash stored in DB), timing-equalized login, generic error messages (no user enumeration), CSRF origin check, per-IP rate limits.
- **Accounts & wallets** — one account per user with a public 6-digit code; one or more wallets per account, each with a currency and a checksummed 11-digit wallet address.
- **Transactions engine** — create-transfer-intent → execute-transfer, keyed by an idempotency `reference`. Money moves exactly once even under replays, resumes, or concurrent execution. Insufficient funds and other failures roll back and only record a FAILED status marker (no partial moves).
- **Cards** — issue, list, and deactivate cards against a wallet (prototype: no external card network).
- **Transaction monitor** — the app polls for a pending/incomplete transfer and offers **complete** (re-POSTs the same intent) or **got it** (acknowledge), so an interrupted transfer is either finished or explicitly discarded — never silently dropped.
- **Demo funding** — optional `POST /api/demo/fund` to top up wallets for exploring (disabled in production).
- **UI** — landing page, auth pages, and an app shell (dashboard, wallets + detail, send, transactions + detail, cards, settings) with responsive navigation.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript (strict) |
| DB | PostgreSQL (Neon) with Drizzle ORM + `node-postgres` |
| Auth | Argon2id, `jose` (sessions can be signed with JWE/encrypted envelopes if enabled) |
| UI | Tailwind CSS 4, Base UI, lucide-react, `cn` |
| Tests | Vitest |
| Tooling | ESLint, `tsc --noEmit`, `next build` |

## Getting started

### 1. Requirements

- Node.js 20+
- A PostgreSQL database (this project targets [Neon](https://neon.tech))

### 2. Install and configure

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL
```

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon connection string for the app database (required) |
| `TEST_DATABASE_URL` | Separate DB for integration tests; empty to skip integration tests |
| `SESSION_TTL_DAYS` | Session lifetime in days (default `7`) |
| `PEBBLE_ENABLE_DEMO_FUNDING` | Set `true` to enable `POST /api/demo/fund` (never in prod) |

### 3. Create the schema and run

```bash
npm run db:migrate   # apply ./drizzle migrations
npm run dev          # http://localhost:3000
```

> The provided migration (`drizzle/0000_*.sql`) creates the schema. In development you can also use `npm run db:push`. Target the right database with drizzle-kit's `--config`/env handling or `drizzle.config.ts`.

### 4. (Optional) Seed demo data

```bash
npx tsx scripts/db-migrate.ts   # reset schema + apply migrations (reliable, code path)
npx tsx scripts/demo-seed.ts    # create demo users, wallets, transfers, cards
```

Seed logins (password `Pebble123!`): `anna@pebble.demo`, `kwame@pebble.demo`, `yawa@pebble.demo`.

> Note: on Neon's pooled connection strings, the `drizzle-kit migrate` CLI can stall on the spinner. `scripts/db-migrate.ts` uses the app's own migrator instead — use it as the reliable fallback. It resets the `public` schema (and drizzle journal) before applying.

Register an account, top up with the **Demo top-up** button on the app, and try sending money between accounts. To test recovery, start a transfer and force-stop / refresh mid-flight before completing — the transaction monitor will offer to **Complete transfer** or **Got it**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (type-checks and lints routes) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (and integration tests when `TEST_DATABASE_URL` is set) |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle tooling |

## Project layout

```
src/app/            Next.js App Router: pages (app shell, auth, landing) + API routes
src/components/     UI components (Base UI primitives, page-specific components)
src/lib/            Server-only business logic (auth, wallets, transactions, cards, db)
  db/               Drizzle schema + client
  client/           Client-side API helpers and shared types (browser only)
src/test/           Integration tests (run against TEST_DATABASE_URL)
drizzle/            SQL migrations
docs/               Architecture, API, and database docs
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md), and [docs/DATABASE.md](docs/DATABASE.md).

## Tests

- **Unit** — wallet-address checksum math (`src/lib/wallet/address.test.ts`). Always run.
- **Integration** — financial invariants of the transaction engine (`src/test/transactions.integration.test.ts`). They create their own data in `TEST_DATABASE_URL` (schema is migrated, tables truncated before each test) and are **skipped** when that URL is unset.

```bash
npm test
```

## Security notes

- Passwords: Argon2id, never stored in plaintext; login uses a dummy hash so "unknown email" and "wrong password" take the same time.
- Sessions: `pebble_session` cookie is HTTP-only, `SameSite=Lax`, `Secure` in production; sessions store a SHA-256 hash (DB breach doesn't leak usable tokens).
- API: all non-GET requests validate the `Origin` header against the request host; registration/login/transfer are rate limited in memory.
- Money: never stored as floats — all amounts are integer minor units.
- Demo funding must remain disabled outside prototypes; setting `PEBBLE_ENABLE_DEMO_FUNDING=true` in production is dangerous by design (documented in the code).

## Disclaimers

This is a prototype. It is not PCI-DSS compliant, has no herding/fraud/KYC pipeline, and no real card processing or external settlement. Do not put real money or real card data through it.