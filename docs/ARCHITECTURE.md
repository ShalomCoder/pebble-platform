# Architecture

Pebble is a Next.js 16 App Router application. Server Components render most pages; API routes back a small client-side app shell. This document explains the money-movement core, the idempotency design, and how the layers fit together.

## Overview

```
┌────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│   Landing / Auth pages   ·   App shell (dashboard, wallets, │
│   send, transactions, cards, settings)                      │
│   └─ client helpers (src/lib/client/*)  ─┐                  │
└──────────────────────────────────────────┼──────────────────┘
                                           │ fetch JSON
┌──────────────────────────────────────────▼──────────────────┐
│  Next.js server                                             │
│   Route handlers (src/app/api/**)                           │
│    └─ wrappers: withAuthRoute / withPublicRoute             │
│       (session, CSRF origin check, rate limits)             │
│    └─ service layer (src/lib/**) → AppError codes           │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Neon) + Drizzle ORM                            │
│   users ─ accounts ─ wallets ── transactions ─ cards        │
│   sessions · audit_logs                                     │
└─────────────────────────────────────────────────────────────┘
```

## Core rules

1. **Money is integer minor units.** `amountMinor`/`balance` are PostgreSQL `bigint`. No floats near money.
2. **Server components never import browser modules, and client components never import server-only modules.** `src/lib/serialize.ts` converts server rows (Dates, DB enums) into the plain ISO-string client types in `src/lib/client/types.ts` at the Server→Client boundary.
3. **API envelope.** Success `{ "data": … }`, failure `{ "error": { "code", "message" } }`. Pages that need multi-step flows use the envelope directly via `src/lib/client/api.ts` (`apiFetch`), which throws `ApiError` with `.code` on non-2xx.

## The transaction engine

The transfer lifecycle is **intent → execute → (acknowledge)**.

### 1. `createTransferIntent`

- Validates the reference, sender wallet, recipient address, amount > 0, and one-active-transaction-per-account.
- **Idempotency**: the reference is the request key. Re-POSTing the same reference + same parameters either resumes the active intent (`mode: "resume"`) or replays the terminal result (`mode: "replay"`) — money never moves twice. Same reference + different parameters → `IDEMPOTENCY_CONFLICT` (409).
- Inserts a `PENDING` transaction row in its own commit, so the intent is durable before execution begins.

### 2. `executeTransferIntent`

- Runs in **one SQL transaction**, serialized by a `SELECT … FOR UPDATE` on the two wallets in deterministic sorted-id order (prevents deadlocks).
- Re-reads balances, re-verifies amount, currency match, wallet ownership, and that the transaction is still active.
- Debits sender, credits recipient, flips the row to `COMPLETED` (with `completionStep` counters). A `PROCESSING` guard makes concurrent executions of the same intent safe: only one observes the active state; the other returns the terminal state.
- On any failure the SQL transaction rolls back — balances are untouched — and the code writes only a `FAILED` status marker.

### 3. `acknowledgeTransaction`

- Marks a completed transaction `completion-acknowledged`. Idempotent. Only for `COMPLETED` rows.

### 4. Transaction monitor (UI)

`src/components/transaction-monitor.tsx` polls `GET /api/transactions/active` every 3 s. If a transfer is found active (e.g. the server died or the tab reloaded mid-execute):

- **Complete transfer** → re-POSTs `/api/transactions` with the **same** `reference`, `senderWalletId`, `recipientAddress`, `amountMinor`, and `memo`. The idempotency rules either resume the intent or return the terminal result; the modal then closes.
- **Got it** → `POST /api/transactions/:id/acknowledge`, which marks the intent failed and lets the user continue.

This guarantees an interrupted transfer is never silently lost: it is either finished or explicitly acknowledged.

### One-active-transaction rule

A partial unique index forbids two active transactions for the same account:

```sql
CREATE UNIQUE INDEX one_active_transaction_per_account
  ON transactions (account_id)
  WHERE status IN ('PENDING', 'PROCESSING');
```

### Failure status markers

Status is derived from step columns (`completionStepState`), not free-form strings. A failed transaction is a `PENDING`/`PROCESSING` row whose `completionStepState` is `'failed'`, so we never represent a partial money move as `COMPLETED` and never lose the original intent data.

## Example: sending money

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as POST /api/transactions
  participant S as Service
  participant D as PostgreSQL

  U->>A: POST {reference, senderWalletId, recipientAddress, amountMinor, memo}
  A->>S: createTransferIntent (reference keyed)
  S->>D: INSERT transactions (PENDING)  -- commit
  S-->>A: {mode:"new", transaction, wallets}
  A-->>U: {data:{...}}   response

  alt user completes in-post
    U->>A: POST same reference (monitor "Complete transfer")
    A->>S: createTransferIntent → resume/replay
    A->>S: executeTransferIntent
    S->>D: BEGIN; LOCK wallets; UPDATE balances; COMMIT
    A-->>U: {status:"COMPLETED", wallets}
  else user acknowledges
    U->>A: POST /api/transactions/:id/acknowledge
    A-->>U: completionAcknowledgedAt
  end
```

## Auth

- `src/lib/auth/password.ts` — Argon2id via `argon2` (wasm/native). Timing-equalized login via a precomputed dummy hash.
- `src/lib/auth/session.ts` — cookie name `pebble_session`; value is a base64url random token encoded in an encrypted/signed envelope (jose) and stored hashed (SHA-256) in `sessions`. Rotation + revocation supported (`sessions` rows carry `rotated_from`).
- `src/lib/auth/service.ts` — `registerUser` creates the user **and** their default GHS wallet inside one DB transaction; `loginUser` writes audit events; `getCurrentUser`/`requireAuth` are the page-side session readers.
- `src/lib/auth/rate-limit.ts` — in-memory sliding-window rate limits per IP (register/login 10/min, transfers 30/min). Fine for a prototype; a production system should use durable storage.
- `src/lib/auth/honeypot.ts` — form honeypot fields for anti-bot noise.

## Client/server boundary

| Directory | Importable from |
| --- | --- |
| `src/lib/*` (except `client/` and shared) | Server only |
| `src/lib/client/*` | Browser only |
| `src/components/ui/*`, `src/components/*` | Both, but server pages pass serialized props |

`src/lib/serialize.ts` is the bridge: `clientWallet` and `clientTransaction` map server rows to `src/lib/client/types.ts` (all dates ISO strings, enums widened to unions).

## Request flow through API wrappers

`withAuthRoute(fn)` (in `src/lib/api/wrappers.ts`):

1. Resolve session from the cookie → 401 if missing.
2. CSRF: non-GET requires the request `Origin` to match `request.nextUrl.origin` (or an allowlist) → 403 otherwise.
3. Rate limit by IP for the specific action.
4. `fn({ db, user, request, params })` → JSON. Errors are mapped via `AppError` (`code`/`status`) in a shared error handler; introspection errors stay generic.

## Directory map

```
src/app/api/               API routes (auth, wallets, transactions, cards, demo)
src/app/app/               Authenticated app pages
src/app/(auth)/            Login / register
src/lib/db/                Drizzle schema + pg client
src/lib/accounts|wallets|transactions|cards/   service layer
src/lib/auth/              password, session, service, rate-limit, honeypot
src/lib/audit.ts           append-only audit log writer
src/lib/errors.ts          AppError + error codes
src/lib/wallet/            address generation + checksum
src/lib/currency.ts        currency whitelist + formatting
```

## Failure modes covered

- Duplicate POST (double-submit, retry) → replay/resume, single move.
- Server crash between intent commit and execution → monitor resumes.
- Concurrent tab execution → one wins, both consistent.
- Insufficient funds / currency mismatch / self-wallet → clean `AppError`, no balance change.
- Authorization (foreign wallet, foreign transaction) → not found.