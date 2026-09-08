# Pebble Platform — Technical Decisions

## 1. Overview

Pebble is a financial **prototype** platform built to demonstrate the concepts
that matter most in money-moving software: transaction integrity, authorization,
duplicate prevention, persistence, recoverability, and audit. It lets a user
hold multiple currency wallets, send money to other Pebble wallets by address,
and inspect a complete transfer history — with the ledger, session, and audit
state persisted in a real relational database.

This document records the major engineering decisions behind that implementation
as it actually exists in the repository. Its purpose is to show that the system
was designed deliberately and that important trade-offs were considered — not to
present Pebble as a production payment system. Where a production capability is
deliberately out of scope, that is stated explicitly in §17.

---

## 2. Technology Stack

| Layer | Choice | Why | Trade-off |
|-------|--------|-----|-----------|
| Full-stack framework | **Next.js 16 (App Router)** on React 19 | First-party route handlers + React Server Components: API routes and authenticated server-rendered pages live in the same codebase, and session identity can be resolved server-side on every render | Couples frontend and backend in one service (fine for a prototype; a large team might split them) |
| Language | **TypeScript 5** | End-to-end type safety between schema rows, services, and API payloads; catches identifier/shape drift at compile time | Some runtime validation is still required because HTTP boundaries are untyped |
| Database | **PostgreSQL** (hosted on Neon) | Strong relational guarantees, `SERIALIZABLE`-grade tools (row locks, partial unique indexes, check constraints, CTE transactions) — the right substrate for a ledger | Requires external hosting and secret management (`.env` `DATABASE_URL`) |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit** | Schema expressed in TypeScript (`src/lib/db/schema.ts`) generates both the SQL migration files and the typed client — no drift between schema and queries | Less mature ecosystem than Prisma; some access patterns are more verbose |
| Driver | **`pg`** (node-postgres) via a singleton pool | One shared connection pool, `max: 5`, cached on the module/global so route handlers reuse connections | Pool sizing is a single constant, not auto-scaled |
| Password hashing | **Argon2id** (`argon2`) | OWASP-recommended memory-hard hash; parameters set explicitly (19 MiB memory, 2 iterations, parallelism 1) | Deliberately CPU-expensive; not a fit for high-throughput auth endpoints |
| UI | **Tailwind CSS 4** + `@base-ui/react`, `cva`, `lucide-react` | Utility-first styling with a small set of primitives; matches the soft flat purple design direction | No component framework (MUI, shadcn/ui) — components are hand-rolled |
| Validation | **Hand-rolled helpers** (`src/lib/validate.ts`, `validateIntentInput`) | Explicit, bounded rules; every check visible and auditable, no heavy schema dependency | More code to maintain than a validation library; rules must be written per-field |
| Tests | **Vitest** (`npm test`) | Unit tests (wallet address) always run; integration tests run against a separate `TEST_DATABASE_URL` and skip when it is absent | Integration suite requires a dedicated test database (§3 TESTING.md) |

**Deliberately not used:** no third-party validation library (rules are hand-rolled
and explicit), no payments/PSP SDK, no message queue or job framework (execution
is synchronous — see §8).

---

## 3. Data Architecture

### Decision

Model the system as `User → Account → Wallet(s)` and represent **every transfer
as a `Transaction` that references two wallets** (sender and recipient), never as
a direct money movement between users.

### Reasoning

- **Wallets are the units of balance and currency.** A user may hold many wallets
  in different currencies. Money lives in wallets; the account is a legal/shell
  entity that owns them. This cleanly separates *identity* (user/account) from
  *money containers* (wallets).
- **Transactions reference wallets, not users**, so the ledger records exactly
  which balances changed and by how much, in one currency, with both endpoints —
  the minimal information needed to reconstruct or verify any move.
- Because `transactions.accountId` stores the **initiating (sender) account**,
  the schema supports both the one-active-transaction-per-sender rule and
  sender-or-recipient visibility (§6, §12).

### Actual schema relationships

```
users 1───1 accounts 1───N wallets 1───N cards
                         │
users 1───N sessions     │
                         └── N transactions ──┐
                     wallets 1───N (as sender) │
                     wallets 1───N (as recipient) ──┘
users 1───N audit_logs
```

Key constraints (enforced by `src/lib/db/schema.ts`):

- `accounts.user_id UNIQUE` — one financial account per user.
- `wallets.address UNIQUE`, `wallets.account_id` indexed.
- `wallets.balance CHECK (>= 0)` and a currency whitelist check.
- `transactions.reference UNIQUE` — the idempotency key (§7).
- `transactions.amount CHECK (> 0)`, sender ≠ recipient, status whitelist.
- **Partial unique index** `one_active_transaction_per_account` on
  `(account_id) WHERE status IN ('PENDING','PROCESSING')` — the database
  enforces at most one active transfer per initiating account (§6).
- `sessions.user_id ON DELETE CASCADE`; other FKs use `NO ACTION`.

### Normalization / denormalization decisions

- Balances are **stored** per wallet (`wallets.balance`) as the source of truth,
  rather than recomputed from a transaction log. This makes reads trivial and
  fast, at the cost of requiring every mutation to keep the balance consistent —
  which the transaction engine does atomically inside one DB transaction (§5).
- Wallets denormalize nothing about the owner except `account_id`; display fields
  like `accountName` are joined at read time, not stored.

---

## 4. Wallet Address Design

### Decision

Wallets are addressed by an **11-digit numeric address**:
`XXX YYYYYY CC` — a 3-digit account fragment, a 6-digit wallet component, and a
2-digit checksum.

### Reasoning

- **Numeric-only** keeps addresses short, legible, and typeable for a demo money
  product (no case-sensitivity risk).
- The **3-digit account fragment is derived deterministically** (FNV-1a over the
  account's opaque `publicCode`) so all of a user's wallets share a recognizably
  consistent prefix, without exposing the sequential DB id.
- The **6-digit wallet component is random**, giving each wallet a distinct
  address. Uniqueness is guaranteed by the `wallets.address UNIQUE` constraint,
  not by chance: address generation is retried on collision (checksum makes the
  namespace 100×10³ wallets per account fragment).
- The **2-digit checksum** (weighted sum of the 9 identity digits, `mod 42`) is
  an **error-detection and structural-validation mechanism**. It catches a
  mistyped digit or transposition before any database work. It is **not** a
  security mechanism and does **not** prove a wallet exists.

### Alternatives Considered

- Alphanumeric/bech32-style addresses (used by crypto ecosystems): compact and
  checksummed, but less friendly for a retail money prototype.
- Fully random opaque strings: no typo protection, no human-recognizable
  structure.
- No address at all (transfer by account code): conflates account identity with a
  single identifiable endpoint, which the wallet model deliberately avoids.

### Trade-offs

The `mod 42` range means the checksum is only 42 possible values — it never adds
cryptographic integrity, and an address is accepted only after **structural
validation plus a database existence/ownership lookup**. Validation
(`validateWalletAddress`) runs before the system attempts to use an address;
after it passes, the server queries PostgreSQL for the wallet rather than
trusting the address alone. An attacker cannot fabricate a valid address for a
wallet they do not control, because the 6-digit wallet component is 6 decimal
digits of randomness and existence is still confirmed in the database.

---

## 5. Transaction Integrity

### Decision

Money movement happens **only** through the transaction engine
(`src/lib/transactions/service.ts`); route handlers authenticate, validate, and
route but never implement the money move themselves. A transfer is executed
inside a **single PostgreSQL transaction**:

```text
BEGIN
  SELECT transaction row ... FOR UPDATE          (by reference)
  SELECT both wallet rows ... FOR UPDATE          (deterministic order)
  guarded transition into PROCESSING
  re-check balance from the locked wallet rows
  UPDATE wallets: debit sender, credit recipient  (integer arithmetic)
  UPDATE transactions: status = COMPLETED
  write audit row(s)
COMMIT
```

### Reasoning

A transfer touches four pieces of state — sender balance, recipient balance,
transaction status, audit trail. If any of those could write independently, a
crash between steps would leave money debited but never credited, or completed
without an audit record. Wrapping all four in one atomic block means the
database itself guarantees all-or-nothing.

### Alternatives Considered

- **Outbox + async settlement**: durable intent in one table, worker performs
  movement later. More complex infrastructure; unnecessary when execution is
  synchronous and in-process.
- **Independent CRUD updates** (debit here, credit there): simplest to write,
  but introduces partial-failure windows and is exactly the design rejected here.
- **Manual "refund" on failure**: compensate for a partially applied transfer by
  running a reverse move. The engine never needs this — a failure *throws inside
  the DB transaction*, so the debit/credit **roll back automatically** and no
  partial financial state ever commits.

### Trade-offs

Holding `FOR UPDATE` locks and re-reading balances adds latency and can serialize
concurrent transfers touching the same wallets, but it is the correct cost for
ledger correctness. The alternative would be optimistic concurrency (version
columns / CAS), which is more complex to reason about for a prototype.

---

## 6. Concurrency Control

### Decision

Pebble prevents two transfers from observing the same balance simultaneously
using **PostgreSQL row locks**, deterministic lock ordering, and a guarded
state transition — plus a **database-enforced limit of one active transaction
per account**.

### The problem prevented

Without synchronization, two concurrent executions against the same sender
wallet could both read `balance = 100`, both pass a `100`-cost check, and both
commit — overdrawing by 50%.

### Actual mechanics

1. **Row lock on the transaction.** `SELECT ... FOR UPDATE` on the transaction
   row ensures only one executor processes a given intent; a concurrent same-
   reference call blocks then observes the terminal state (§7) rather than
   double-executing.
2. **Deterministic wallet lock order.** The two wallet ids are sorted
   lexicographically before `SELECT ... FOR UPDATE`, so two transfers moving in
   opposite directions lock wallets in the same order and cannot deadlock each
   other on lock acquisition.
3. **Balances are read from the freshly locked rows.** The insufficient-funds
   check compares the *locked* `sender.balance` against the amount, so the value
   cannot change under the transaction.
4. **Guarded transition into `PROCESSING`.** The executor issues `UPDATE ... SET
   status='PROCESSING' WHERE id=? AND status IN ('PENDING','PROCESSING')` and
   only proceeds if exactly one row was updated — so only one executor performs
   the money move.
5. **One active transfer per account (database level).** The partial unique index
   on `(account_id) WHERE status IN ('PENDING','PROCESSING')` makes the
   one-at-a-time rule a durability property of the schema, not just an app
   check. The service also checks first to return the friendly
   `ACTIVE_TRANSACTION_EXISTS` error; the index is the authoritative backstop.

### Trade-off of the one-active-transaction rule

An account can only have one transfer in flight at a time. This intentionally
removes the hardest concurrency scenarios (multiple simultaneous in-flight
transfers from one account) for the prototype; the lock ordering + guarded
execution still handle the genuinely concurrent case of two *different* accounts
racing on a shared wallet. Removing the rule later would mean relying purely on
row locks for higher throughput without the schema-level safety net.

---

## 7. Idempotency and Duplicate Transfers

### Decision

Every transfer carries a **client-supplied reference** that is required to match
`PB-XXXXXXXX-XXXX` and is stored in a **`UNIQUE` column**. The reference is the
idempotency key, and uniqueness is enforced at the database level.

### Reasoning

The motive for them is the UI:
- **UI duplicate prevention** (double-click guards, disabled submit buttons,
  in-flight spinners) only shapes the *experience*. It is not a security
  boundary — a user can retry with curl.
- **Server/database duplicate prevention** is the real boundary. A client may
  submit the same transfer twice (double-click, retry after timeout, reconnect)
  and the server must not move money twice.

### Actual behavior (`createTransferIntent`)

| Case | Result |
|------|--------|
| New reference | New `PENDING` transaction created |
| Same reference + **same** parameters, terminal state | `replay` — existing transaction returned, **money does not move again** |
| Same reference + **same** parameters, active state | `resume` — recovery path returns the in-flight transaction |
| Same reference + **different** parameters | `409 IDEMPOTENCY_CONFLICT` — existing transaction left unchanged |
| Validation/application target | If a second insert races past the pre-check, the `UNIQUE(reference)` constraint raises `23505`, caught and mapped to the same conflict error |

A transfer never keys off the frontend; the authoritative check is the unique
constraint and the in-transaction comparison against the existing row.

---

## 8. Transaction Lifecycle

### Decision

Transaction status is **persisted** in four states:

- `PENDING` — an intent has been reserved (reference, wallets, amount, memo),
  nothing has moved.
- `PROCESSING` — an executor has won the guarded transition and is debiting/
  crediting.
- `COMPLETED` — the atomic block committed; balances moved.
- `FAILED` — a terminal marker set when execution could not move money
  (currently only `INSUFFICIENT_FUNDS`), with `failed_reason` recorded.

The `CHECK (status IN (...))` whitelist constrains these states at the schema
level.

### Why persist state rather than keep it in the frontend

The frontend is ephemeral. The database is the source of truth: the same
transaction must be visible from a second device, after a reload, and after
process restart. Persisting the lifecycle (including `created_at`,
`completed_at`, `failed_at`, `failed_reason`) is what makes recovery (§9) and
audit (§14) possible.

### Synchronous execution — an explicit prototype trade-off

Execution is **synchronous**: `POST /api/transactions` creates the intent and
executes it in the same request (functions called back-to-back in the route).
There is no queue, worker, or polling. This is correct and simple for a
prototype where the whole operation takes milliseconds, but it means request
timeout/availability implies transfer outcome. The architecture already isolated
the pieces needed to evolve to async later: intent creation and execution are
separate functions with persisted state, so a worker could later pick up `PENDING`
rows and run `executeTransferIntent` asynchronously without schema changes.

---

## 9. Transaction Recovery

### Decision

A transaction in progress is **recoverable from the database**, not from the UI.

- The server persists the full intent at `createTransferIntent` (PENDING) before
  any money moves.
- `GET /api/transactions/active` returns the account's active transaction from
  `getActiveTransaction` (one active per account, so recovery is unambiguous).
- The recovery path is **idempotent replay, not blind retry**: the client
  resubmits with the **same reference**, and `createTransferIntent` returns the
  existing transaction in `resume` (still active) or `replay` (already
  terminal) mode — money is never moved twice (§7).

### Why the client does not blindly retry after reload

A retry with a *new* reference would create a second transfer; a retry with the
*same* reference is safe by construction. Pebble therefore reuses the reference
for recovery. The database is the source of truth for whether the first attempt
succeeded, so the outcome is consistent regardless of what the user's browser
observed.

### Edge case: the request never reached the server

If the original request never reached the server, no transaction row exists. The
client has no reference on record for a transfer it was about to submit; the
next submission simply creates a new intent. If the request *reached* the server
but the response was lost, the row exists and replay/resume resolves the
ambiguity.

---

## 10. Transaction Completion Acknowledgment

### Decision

`completed_at` (financial completion) and
`completion_acknowledged_at` (user acknowledgment) are **separate fields** on
the same row, and a completed transaction has `needsAcknowledgment: true` until
acknowledged.

### Reasoning

Completion happens in the database at the moment money moves. The user might be
away, or on another device, and never see the result screen. Separating the two
states lets Pebble tell the user "this transaction completed while you were
away" via a pending-acknowledgment state, and lets the product distinguish
*settlement* from *observed settlement*.

### Acknowledgment semantics

`POST /api/transactions/[id]/acknowledge` only records that the user **performed
an explicit action**, is **idempotent**, requires the transaction to belong to
the caller, and **never alters financial state** (it cannot run on
non-`COMPLETED` transactions). It does not claim to prove a human literally saw a
particular screen — it is an auditable receipt of an explicit UI action, and it
feeds the audit log (`completion_acknowledged`).

---

## 11. Authentication

### Decision

Cookie-based server-side sessions; passwords hashed with **Argon2id**.

- **Password hashing** (`src/lib/auth/password.ts`): Argon2id, 19 MiB memory,
  2 iterations, parallelism 1. Passwords are never stored in plaintext and never
  logged.
- **Sessions** (`src/lib/auth/session.ts`): login/registration produce an opaque
  token (`randomBytes(32)`, base64url) set in an **HTTP-only, `SameSite=Lax`**
  cookie (`secure` in production). The database stores only the token's
  **SHA-256 hash**. Session state is entirely server-side; the cookie is
  dangling-proof because it maps to a stored, non-expired row.
- **Registration** (`POST /api/auth/register`): atomically creates user +
  account + default GHS "Main wallet" in one DB transaction, generates a unique
  6-digit `public_code`, and returns a session cookie. Duplicate email → 409.
- **Login** (`POST /api/auth/login`): verifies credentials using a
  **timing-equalizing dummy hash** for unknown emails and a single generic
  error, so response behavior cannot be used to enumerate accounts.
- **Logout** (`POST /api/auth/logout`): deletes the session row server-side and
  clears the cookie.
- **Password change** (`POST /api/auth/password`): verifies the current
  password, hashes the new one, audits, then **signs out all other sessions**
  while keeping the session that performed the change.
- **Route protection**: server-side `requireAuth()` inside `withAuthRoute`
  resolves the user from the session cookie on every protected route; the user
  id is never taken from client input.

---

## 12. Authorization

### Decision

Authorization is enforced **server-side on every request**, distinct from
authentication. The authenticated *session* is the only source of the caller's
identity; every resource identifier supplied by the client is treated as an
untrusted reference that must be verified for ownership.

### Actual checks

- **Account access:** `requireAccountForUser(userId)` loads the account that
  *belongs to* the session user and throws `ACCOUNT_NOT_FOUND` otherwise.
- **Wallet access:** `requireOwnedWallet(accountId, id)` returns a wallet only if
  both id *and* `account_id` match; all wallet reads/creates go through this.
- **Transaction access:** `getTransactionForAccount` matches the transaction id
  against the caller as **sender OR recipient**, so a user sees only their own
  sent, received, and self transfers; another user's transfer returns "not
  found" (no existence oracle). `acknowledgeTransaction` and the card routes
  apply the same ownership join.
- **Card access:** cards are looked up only via their wallet's `account_id`.

### Why client-supplied IDs are not trusted as proof of ownership

An attacker can trivially send another user's UUID/address in a request. Every
layer of the app re-derives the actor from the session and cross-checks resource
ownership in SQL. Frontend controls (hiding UI, disabling buttons) affect only
presentation — they are never the security boundary. This is reflected in the
integration tests (§ TESTING.md), including "prevents reading another account's
transaction" and "rejects sending from a wallet that does not belong to the
account".

---

## 13. Input Validation and Error Handling

### Decision

Validate at **multiple layers**, with server-side validation as the security
boundary:

1. **Route/field validation** (`src/lib/validate.ts`): hand-rolled, explicit
   helpers — required strings with bounds, email format, password policy
   (8–72 chars, letter + number), positive integer minor-unit amounts capped at
   `1_000_000_000_000`.
2. **Business validation** in services: `validateIntentInput` checks the
   reference format (`PB-XXXXXXXX-XXXX`), the sender id format, the amount range,
   the memo length (≤140), and wallet-address structure — all before DB work.
3. **Database constraints** as the final backstop: `CHECK` constraints
   (non-negative balance, positive amount, currency/status whitelists, sender ≠
   recipient), `UNIQUE` (reference, address, email, public code), and the partial
   unique index.
4. **Safe error handling** (`src/lib/api.ts`, `src/lib/errors.ts`): every route
   is wrapped so unexpected errors become a generic `500 INTERNAL` response;
   `AppError` carries a `publicMessage` safe to show. **Raw database errors,
   stack traces, and internal messages never reach the client** (they are logged
   server-side). Unknown credentials, unknown emails, and cross-account lookups
   all return generic messages to avoid leaking existence.

Why multiple layers: each closes a different gap — routes protect against
malformed HTTP, services protect invariants that need DB context, and the
constraints protect against any path (including future code) that bypasses both.

---

## 14. Audit Logging

### Decision

Maintain an **append-only `audit_logs` table** in addition to transaction
history, to answer *two different questions*:

- **Transaction history** (transactions table): *What happened to the money?*
  Amount, currency, participants, status, timestamps.
- **Audit log** (`audit_logs`): *What actions did the user/system perform?*
  Who (user id, IP, user agent), what action, on what resource, with what
  metadata, when.

### Why it exists

Audit rows record security-sensitive and financial actions that the transaction
table alone would not capture — failed login attempts, password changes, session
invalidations, card issuance/deactivation, demo funding, acknowledgments, and
the account registration itself. This makes it possible to investigate *how* a
state came to be (e.g. a session was revoked, a password was changed) and to
reconstruct the history around a failed transfer with the `transaction_failure`
row that records `failed_reason`. Audit rows are **never editable or deletable
through any user-facing API** (append-only via `writeAudit`), and the `Activity`
section of the Settings UI surfaces a projection of this data.

Important events recorded: `registration`, `login_success`, `login_failure`,
`logout`, `password_changed`, `session_invalidated`, `wallet_created`,
`transaction_created`/`processing`/`completed`/`failure`,
`completion_acknowledged`, `card_created`/`card_deactivated`, `demo_funding`,
`account_updated`.

---

## 15. Security Decisions

Implemented in the current codebase:

- **Password security**: Argon2id (19 MiB, 2 iterations); plaintext never stored
  or logged; length-bounded input.
- **Session security**: SHA-256-hashed tokens server-side, random 256-bit
  tokens, HTTP-only + `SameSite=Lax` + `secure`(prod) cookies, server-side
  expiry, expired-session pruning.
- **Login hardening**: timing-equalizing dummy hash + single generic
  "Invalid email or password" error; immediate success/failure audit.
- **Authorization**: server-side ownership checks on every protected resource
  (§12); client-supplied ids never trusted as identity.
- **CSRF resistance**: `SameSite=Lax` cookie plus explicit `Origin` /
  `Sec-Fetch-Site` verification on all state-changing methods
  (`assertNoCrossSiteRequest`) inside the route wrapper.
- **Server-side validation** at routes, services, and DB constraints (§13).
- **Transaction isolation/locking** and schema-level idempotency constraints
  (§5–7).
- **Safe error responses**: bounded `AppError` codes/messages; unknown errors
  become generic 500s; no stack/db internals leaked.
- **Rate limiting**: per-route, per-IP sliding window over login/register and
  transaction creation.

### Prototype gaps / trade-offs (stated honestly)

- The rate limiter is **in-memory** per instance and resets on restart — fine for
  a single prototype instance, not for horizontal scaling.
- **Demo funding is enabled by default** (`PEBBLE_ENABLE_DEMO_FUNDING` defaults
  to true), letting a signed-in user inflate a balance. This is a prototype
  affordance that must be disabled outside demo environments.
- Audit IPs come from `x-forwarded-for`/`x-real-ip` and are informational, not
  hardened identity.
- There is no account-recovery flow, no fraud model, and no production
  observability stack.

---

## 16. UI and Product Design

Pebble's visual direction is deliberate: **soft flat design with subtle
neumorphic influence, purple theming, organic geometry, generous whitespace, and
restrained visual playfulness** — soft shadows, rounded forms, a cohesive purple
palette, calm motion, and accessible, responsive layouts. The interface
intentionally avoids generic dashboard layouts, heavy traditional neumorphism,
excessive gradients, and unnecessary visual or card-based complexity. This choice
keeps the prototype approachable for a demo audience while the engineering
values of §1 remain the primary focus.

---

## 17. Prototype Trade-offs

Pebble deliberately does **not** attempt to solve production payment
infrastructure. These are scope decisions, not omissions:

| Out of scope | Why it is not a prototype concern |
|--------------|-----------------------------------|
| Real bank/payment-network integration, external settlement, reconciliation | Money exists only as ledger arithmetic inside Pebble's own DB; demo funding stands in for external deposits |
| Regulatory compliance, KYC/AML, identity verification | Require legal/business context and third-party verification; out of scope for a correctness demo |
| Production-grade fraud detection | No real money or external rails; the system tracks its own invariants instead |
| Real card-network processing | Cards are display-only artifacts (last-four + type), never charged |
| Production-scale asynchronous infrastructure | Execution is synchronous by design (§8); the intent/execution split leaves a path to async later |
| Advanced account recovery / password reset | Not implemented; password changes require the current password |
| Production monitoring / observability | Comprehensive logging and audit exist; no metrics/alerting stack |
| Multi-currency FX conversion | Single-currency transfers only; `CURRENCY_MISMATCH` is enforced |

Each item above was evaluated and set aside to keep the prototype focused on
financial correctness, authorization, transaction integrity, duplicate
protection, persistence, and recoverability — the properties an evaluator can
inspect directly in this codebase.

---

## Summary

Pebble was built so that the *financial core is correct before features grow*.
Its architecture prioritizes **transaction integrity (atomic, locked,
rollback-safe money movement), authorization at every boundary, idempotency and
duplicate protection that live in the database, durable persisted state (with a
distinct acknowledgment state for user-observed settlement), and an append-only
audit trail** — while deliberately limiting scope to what a prototype needs.
Where production concerns were consciously deferred, they are documented as
trade-offs rather than hidden. The result is a small, auditable system that shows
engineering judgment about *why* financial software is built the way it is.