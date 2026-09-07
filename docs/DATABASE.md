# Database

PostgreSQL via Drizzle ORM. The schema is defined in `src/lib/db/schema.ts`; the persisted form lives in the `drizzle/` migration SQL. Only one migration exists so far (`0000_*.sql`).

Guiding principle: **money is never a float.** Balances and amounts are `BIGINT` minor units; wallet positive-balance and amount > 0 are enforced by `CHECK` constraints at the database level.

## Schema overview

```
users ─1:1─ accounts ─1:N─ wallets ── transactions (sender/recipient wallets)
              │  └── cards (on a wallet)
users ─1:N─ sessions
users ─1:N─ audit_logs
```

## Tables

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | default random |
| full_name | text | |
| email | text unique | lowercased at write |
| password_hash | text | Argon2id |
| created_at / updated_at | timestamptz | |

### `sessions`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| token_hash | char(64) unique | SHA-256 hex of the opaque cookie token; the plaintext token is only ever in the browser cookie |
| user_id | uuid FK → users | ON DELETE CASCADE |
| expires_at | timestamptz | |
| created_at / last_seen_at | timestamptz | |
| ip_address / user_agent | text | |

### `accounts`

One per user (`user_id` unique). Represents the customer relationship.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | internal only |
| user_id | uuid unique FK → users | |
| public_code | text unique | 6-digit opaque public identifier; never the sequential DB id |
| status | text default `ACTIVE` | |
| created_at / updated_at | timestamptz | |

### `wallets`

Money lives in wallets. Each has a currency and a global address.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| account_id | uuid FK → accounts | |
| address | text unique | 11 digits = 9 identity digits + 2 checksum digits (Mod-42 checksum over weights `[7,11,3,19,5,13,17,4,2]`) |
| name | text | e.g. "Main wallet", "Savings" |
| currency | text | CHECK: `GHS`, `USD`, `EUR` or `GBP` |
| balance | bigint | CHECK ≥ 0 (minor units) |
| status | text default `ACTIVE` | |
| created_at / updated_at | timestamptz | |

Indexes: `(account_id)`, `(currency)`.

### `cards`

Prototype cards against a wallet. No PAN/CVV ever stored — only the last four digits.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| wallet_id | uuid FK → wallets | |
| last_four | text | 4 digits |
| card_type | text | CHECK: `VISA` / `MASTERCARD` / `VERVE` |
| status | text default `ACTIVE` | `ACTIVE` / `INACTIVE` |
| created_at / expires_at | timestamptz | |

### `transactions`

The heart of the transfer engine. Statuses are **state-machine values**, not random strings:

`PENDING` → `PROCESSING` → `COMPLETED`, or to `FAILED` (a status marker that never moves money).

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| account_id | uuid FK → accounts | the initiating (sender) account; used by the one-active rule |
| reference | text unique | idempotency key; format `PB-XXXXXXXX-XXXX` (`[0-9A-Z]`), generated client-side at submit time, never on page load |
| sender_wallet_id / recipient_wallet_id | uuid FK → wallets | constrained `sender <> recipient` |
| amount | bigint | CHECK > 0 (minor units) |
| currency | text | sender wallet's currency |
| status | text default `PENDING` | CHECK whitelist |
| memo | text nullable | ≤ 140 chars |
| created_at | timestamptz | |
| completed_at | timestamptz nullable | when COMPLETED |
| failed_at | timestamptz nullable | when marked FAILED |
| completion_acknowledged_at | timestamptz nullable | set by `POST /api/transactions/:id/acknowledge` |

**Concurrency/integrity guarantees (in SQL):**

```sql
-- Reference uniqueness: an idempotent key can never create two rows.
reference text UNIQUE

-- One in-flight transaction per account (PENDING or PROCESSING).
CREATE UNIQUE INDEX one_active_transaction_per_account
  ON transactions (account_id)
  WHERE status IN ('PENDING', 'PROCESSING');

-- A transfer can never be between the same wallet.
CHECK (sender_wallet_id <> recipient_wallet_id)

-- Amounts are strictly positive.
CHECK (amount > 0)
```

Indexes: `(account_id)`, `(status)`, `(sender_wallet_id)`, `(recipient_wallet_id)`, `(created_at)`.

### `audit_logs`

Append-only event log (registration, login success/failure, transfers, wallet/card operations).

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid nullable FK → users | |
| action | text | e.g. `registration`, `login_success`, `login_failure`, `transfer_initiated`, `transfer_completed`, `transfer_failed`, `wallet_created`, `card_created`, `card_deactivated` |
| resource_type / resource_id | text / uuid | e.g. `wallet` / wallet id |
| metadata | jsonb | free-form event context |
| ip_address / user_agent | text | |
| created_at | timestamptz | |

Indexes: `(user_id)`, `(action)`, `(created_at)`.

## Addresses & checksum

Wallet addresses are 11 digits: `AAABBBCCC` + `DD`.

- 3-digit fragment from a public code hash + 6 digits of randomness (identity).
- 2 checksum digits = `sum(identityDigit[i] × weight[i]) mod 42`, weights `[7,11,3,19,5,13,17,4,2]`, rendered as a zero-padded 2-digit number.

Implementation: `src/lib/wallet/address.ts`, unit-tested in `src/lib/wallet/address.test.ts`.

## Migrations

```bash
npm run db:generate   # diff schema → new migration SQL
npm run db:migrate    # apply pending migrations to DATABASE_URL
npm run db:push       # push schema without SQL files (dev)
npm run db:studio     # browse DB
```

Integration tests migrate the test database themselves (via `drizzle-orm/node-postgres/migrator`) before running against `TEST_DATABASE_URL`.

## Backups / safety

- Truncating `users` with `CASCADE` wipes the whole graph (used by integration tests to reset state).
- The `RESTART IDENTITY`/`CASCADE` truncate is safe because no wallet is ever shared across accounts and every row traces to a `user_id`.