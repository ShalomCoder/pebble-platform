# Pebble Platform — Database Documentation

This document describes the Pebble relational schema and the surrounding
database tooling, conventions, and operations.

The database is **PostgreSQL** (hosted on [Neon](https://neon.tech)). Schema
definition and migrations are managed with **Drizzle ORM** / **drizzle-kit**.

---

## Overview

- **Driver**: `pg` (node-postgres) + `drizzle-orm/node-postgres`.
- **Connection**: a small singleton `Pool` (`max: 5`) created in
  `src/lib/db/index.ts`, driven by the `DATABASE_URL` environment variable.
- **Schema source of truth**: `src/lib/db/schema.ts` (Drizzle table definitions).
- **Migration output**: `./drizzle` (SQL files + meta snapshots).
- **Convention**: money is stored as **integer minor currency units** in
  `BIGINT`. Floating point is never used for money.

### Table index

| Table | Purpose |
|-------|---------|
| `users` | Authentication identities (name, email, Argon2id hash) |
| `sessions` | Server-side session records (token hash, expiry, UA/IP) |
| `accounts` | One-to-one financial account per user, opaque `public_code` |
| `wallets` | Currency-specific balances/wallets owned by an account |
| `cards` | Virtual demo cards attached to a wallet (last-four only) |
| `transactions` | Money transfers between wallets (sender OR recipient) |
| `audit_logs` | Append-only security/financial audit trail |

---

## Tables

### `users`

One row per registered human.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `full_name` | `text` not null | |
| `email` | `text` not null, **unique** | lowercased |
| `password_hash` | `text` not null | Argon2id encoded |
| `created_at` | `timestamptz` not null | default `now()` |
| `updated_at` | `timestamptz` not null | default `now()` |

**Constraints**: `users_email_unique`.

---

### `sessions`

Server-side session records. The plaintext session token lives only in the
client cookie; the database stores its SHA-256 hex digest.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `token_hash` | `char(64)` not null, **unique** | SHA-256 hex of the token |
| `user_id` | `uuid` not null FK → `users.id` | `ON DELETE cascade` |
| `expires_at` | `timestamptz` not null | |
| `created_at` | `timestamptz` not null | default `now()` |
| `last_seen_at` | `timestamptz` not null | default `now()` |
| `ip_address` | `text` nullable | |
| `user_agent` | `text` nullable | |

**Constraints**: `sessions_token_hash_unique`; FK `ON DELETE cascade` (deleting a
user removes their sessions).

---

### `accounts`

A user has exactly **one** financial account.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` not null, **unique** FK → `users.id` | one-to-one |
| `public_code` | `text` not null, **unique** | opaque public identifier |
| `status` | `text` not null | default `'ACTIVE'` |
| `created_at` | `timestamptz` not null | default `now()` |
| `updated_at` | `timestamptz` not null | default `now()` |

**Constraints**: `accounts_user_id_unique`, `accounts_public_code_unique`.

> **Security**: the opaque `public_code` is what is exposed publicly (e.g. on the
> Settings page). Sequential DB ids are never exposed as public identifiers.

---

### `wallets`

A wallet holds a balance in a single currency and belongs to an account.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `account_id` | `uuid` not null FK → `accounts.id` | |
| `address` | `text` not null, **unique** | globally unique 11-digit address |
| `name` | `text` not null | |
| `currency` | `text` not null | `GHS`/`USD`/`EUR`/`GBP` |
| `balance` | `bigint` not null | default `0`, minor units, never negative |
| `status` | `text` not null | default `'ACTIVE'` |
| `created_at` | `timestamptz` not null | default `now()` |
| `updated_at` | `timestamptz` not null | default `now()` |

**Constraints & indexes**:
- `wallets_address_unique`
- `CHECK wallet_balance_nonnegative` → `balance >= 0`
- `CHECK wallet_currency_whitelist` → `currency in ('GHS','USD','EUR','GBP')`
- Index `wallets_account_idx` on `account_id`
- Index `wallets_currency_idx` on `currency`

**Wallet addresses** (`src/lib/wallet/address.ts`):

```
XXXXXXXXX CC
|______| |
 identity  checksum (2 digits, weighted Mod-42)
```

An 11-digit numeric address is composed of a 3-digit account fragment (derived
deterministically via FNV-1a from the account `public_code`, so identical across
all of a user's wallets), a 6-digit random wallet component, and a 2-digit
checksum for structural error detection. Validation is **local/structural only** —
the server must still confirm the address exists and is owned via the database.

---

### `cards`

Virtual/demo cards attached to a wallet. **Real PANs and CVVs are never
stored** — only a `last_four` and a type.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `wallet_id` | `uuid` not null FK → `wallets.id` | |
| `last_four` | `text` not null | last-4 only |
| `card_type` | `text` not null | `VISA`/`MASTERCARD`/`VERVE` |
| `status` | `text` not null | default `'ACTIVE'` |
| `created_at` | `timestamptz` not null | default `now()` |
| `expires_at` | `timestamptz` not null | set to ~3 years out |

**Constraints & indexes**:
- `CHECK cards_type_whitelist` → `card_type in ('VISA','MASTERCARD','VERVE')`
- Index `cards_wallet_idx` on `wallet_id`

---

### `transactions`

A transfer between two wallets. Money always moves **from** `sender_wallet_id`
**to** `recipient_wallet_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `account_id` | `uuid` not null FK → `accounts.id` | **the sender/initiating account** |
| `reference` | `text` not null, **unique** | idempotency key `PB-XXXXXXXX-XXXX` |
| `sender_wallet_id` | `uuid` not null FK → `wallets.id` | |
| `recipient_wallet_id` | `uuid` not null FK → `wallets.id` | |
| `amount` | `bigint` not null | minor units, `> 0` |
| `currency` | `text` not null | |
| `status` | `text` not null | `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`, default `PENDING` |
| `memo` | `text` nullable | ≤ 140 chars |
| `created_at` | `timestamptz` not null | default `now()` |
| `completed_at` | `timestamptz` nullable | set on success |
| `failed_at` | `timestamptz` nullable | set on failure |
| `failed_reason` | `text` nullable | e.g. `INSUFFICIENT_FUNDS` (only on failed) |
| `completion_acknowledged_at` | `timestamptz` nullable | set when user acknowledges |

**Constraints & indexes**:
- `transactions_reference_unique` — database-level idempotency enforcement
- `CHECK tx_amount_positive` → `amount > 0`
- `CHECK tx_sender_not_recipient` → `sender_wallet_id <> recipient_wallet_id`
- `CHECK tx_status_whitelist` → `status in ('PENDING','PROCESSING','COMPLETED','FAILED')`
- **Unique partial index** `one_active_transaction_per_account` on `account_id`
  `WHERE status in ('PENDING','PROCESSING')` — enforces at most one active
  transaction per initiating account
- Indexes: `transactions_account_idx`, `transactions_status_idx`,
  `transactions_sender_idx` (sender wallet), `transactions_recipient_idx`
  (recipient wallet), `transactions_created_idx` (creation time)

**Status lifecycle**: `PENDING → PROCESSING → COMPLETED`, or
`PENDING/PROCESSING → FAILED`.

> **Important**: `account_id` always stores the **sender/initiating** account,
> never the recipient. To show received transactions, queries must match the
> viewer as **sender OR recipient** wallet owner.

---

### `audit_logs`

Append-only security/financial audit trail. Rows are never edited or deleted via
any user-facing API.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` nullable FK → `users.id` | |
| `action` | `text` not null | see `AuditActions` below |
| `resource_type` | `text` nullable | e.g. `wallet`, `transaction`, `card` |
| `resource_id` | `uuid` nullable | |
| `metadata` | `jsonb` nullable | free of sensitive secrets |
| `ip_address` | `text` nullable | |
| `user_agent` | `text` nullable | |
| `created_at` | `timestamptz` not null | default `now()` |

**Indexes**: `audit_user_idx` (`user_id`), `audit_action_idx` (`action`),
`audit_created_idx` (`created_at`).

**Audit actions** (`src/lib/audit.ts`, `AuditActions`):

| Action | Meaning |
|--------|---------|
| `registration` | New account registered |
| `login_success` | Successful sign-in |
| `login_failure` | Failed sign-in attempt |
| `logout` | Signed out |
| `password_changed` | Password updated |
| `session_invalidated` | Other sessions revoked (incl. on password change) |
| `wallet_created` | Wallet created |
| `transaction_created` | Transfer intent created |
| `transaction_processing` | Transfer began processing |
| `transaction_completed` | Transfer succeeded |
| `transaction_failure` | Transfer failed |
| `completion_acknowledged` | User acknowledged completion |
| `card_created` | Virtual card issued |
| `card_deactivated` | Virtual card deactivated |
| `demo_funding` | Demo funds added |
| `account_updated` | Profile updated |

---

## Relationships (ER summary)

```
users 1 ─── 1 accounts
users 1 ─── N sessions        (cascade delete)
accounts 1 ─── N wallets
wallets 1 ─── N cards
accounts 1 ─── N transactions (as initiator)
wallets 1 ─── N transactions  (as sender)
wallets 1 ─── N transactions  (as recipient)
users 1 ─── N audit_logs      (nullable)
```

---

## Conventions

### Money
- Always an integer count of **minor currency units** in `BIGINT`.
- Never negative (`wallet_balance_nonnegative` check).
- Transfer `amount` always `> 0`.

### Identifiers
- Row ids are **UUIDs** (`gen_random_uuid()`).
- Public identifiers are opaque: `accounts.public_code` (text) and
  `wallets.address` (11-digit numeric). Sequential UUIDs are never exposed as
  public customer-facing identifiers.

### Timestamps
- All timestamps are `timestamptz` (timezone-aware).
- `created_at`/`updated_at` default to `now()`; `updated_at` is set on mutation
  in application code (there is no DB trigger).

### Referential actions
- `sessions.user_id` → `users.id` `ON DELETE CASCADE`.
- All other FKs use `ON DELETE NO ACTION` (records are never hard-deleted).

---

## Migrations & tooling

Source of truth: `src/lib/db/schema.ts`. Generated SQL lives in `./drizzle`.

```
# Generate a new migration from schema changes
npm run db:generate

# Apply pending migrations to the configured DATABASE_URL
npm run db:migrate

# Push schema directly (dev convenience — not used for prod changes)
npm run db:push

# Open Drizzle Studio against the DB
npm run db:studio
```

- Config: `drizzle.config.ts` (`schema`, `out: "./drizzle"`, `dialect:
  "postgresql"`, `strict: true`).
- Migration journal: `drizzle/meta/_journal.json`.
- Current migrations: `0000_striped_firestar.sql` (initial schema),
  `0001_lethal_shockwave.sql` (adds `transactions.failed_reason`).

### General dev workflow
1. Edit `src/lib/db/schema.ts`.
2. `npm run db:generate` → produces a new numbered SQL file + snapshot.
3. Apply with `npm run db:migrate`.

> Changes to the database schema require a migration to be generated **and**
> applied before the corresponding API/service code can rely on the new column.

---

## Unique-constraint handling

Uniqueness is enforced at the database level (`isUniqueViolation` checks the
PostgreSQL SQLSTATE `23505` in `src/lib/db/client.ts`). Callers detect and map
these to business errors, e.g.:

- Duplicate `users.email` → `EMAIL_TAKEN`.
- Duplicate `transactions.reference` → idempotent resume/replay.
- Unique `one_active_transaction_per_account` → `ACTIVE_TRANSACTION_EXISTS`.
- `wallets.address` collision → regenerate and reuse address.

---

## Server-only client

The database client is **server-only** (never imported from client components).
It uses a cached single `Pool` (module singleton) so route handlers share
connections instead of creating a new pool per request.

- `src/lib/db/index.ts` — pool + drizzle instance + `schema` export.
- `src/lib/db/client.ts` — `DbClient` typing + `isUniqueViolation` helper.
- Must have `DATABASE_URL` configured (see `.env.example`).

---

## Environments

- **Production**: live Neon Postgres via `DATABASE_URL` (pooler URL in `.env`).
  Deployed build runs against Neon.

> The `DATABASE_URL` / Neon credentials are secrets and must not leak into the
> repository or API responses.
