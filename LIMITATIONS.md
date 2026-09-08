# Pebble Platform — Known Limitations

This document lists the known limitations, constraints, and prototype-grade
trade-offs of the Pebble platform. It is intended to be candid about what the
system does **not** do, so reviewers can distinguish intentional prototype
simplifications from production features.

These limitations fall into three groups: **financial/transactional**,
**platform/security**, and **product/operational**.

---

## 1. Financial & transactional limitations

### 1.1 Single failure reason
The only failure reason currently produced in code is `INSUFFICIENT_FUNDS`.
Failed transactions can only be **sender-initiated** — a transaction fails
because the sender lacks sufficient balance. No other failure modes (recipient
wallet inactive, provider/clearing failure, network failure mid-transfer) are
modeled; those cases surface as `WALLET_NOT_FOUND`,
`CURRENCY_MISMATCH`, `WALLET_INACTIVE`, etc. before execution rather than as
post-execution `failed_reason` states.

### 1.2 No external money movement
All "deposits" are either:
- the prototype **demo funding** endpoint (`/api/demo/fund`), or
- direct seed writes in `scripts/demo-seed.ts`.

There is no bank/PSP integration, no card payments, no external funding rails.
Funds are purely ledger arithmetic inside the app's own database.

### 1.3 Single-currency transfers only
A transfer requires the sender and recipient wallets to share the **same
currency** (`CURRENCY_MISMATCH` otherwise). There is **no currency conversion /
FX**. Each wallet holds exactly one currency and money never moves across
currencies.

### 1.4 Amount caps
- Max single transfer: `1_000_000_000_000` minor units.
- Max memo length: `140` characters.
- Max demo deposit: `100_000_000_00` minor units (100,000 major) per call.
These are hard-coded constants, not configurable per-account or per-rule.

### 1.5 No partial refunds / reversals / chargebacks
Failed transactions never move money (atomics guarantee no balance change on
failure), but once a transfer is `COMPLETED` there is no reversal, refund, or
chargeback path in the product.

### 1.6 Direction filtering is applied in memory
On the transactions list endpoint, the `direction` filter is applied **after**
the SQL query in application memory, because direction is derived from
ownership (`sent | received | self`). It is not a SQL WHERE clause, so it does
not scale as efficiently as the other filters and pagination counting accounts
for the unfiltered set.

---

## 2. Platform & security limitations

### 2.1 Rate limiter is in-memory and per-instance
The rate limiter (`src/lib/rate-limit.ts`) stores state in **process memory**.
Limits are therefore per-server-instance and **reset on restart**. Horizontal
scaling (multiple instances) would bypass or split limits. A production
deployment should use a shared store (e.g. Redis).

### 2.2 Demo funding is enabled everywhere by default
`PEBBLE_ENABLE_DEMO_FUNDING` defaults to **true** if unset. The endpoint must
be disabled (`=false`) outside a demo/prototype environment — it lets a logged-in
user arbitrarily inflate their wallet balance.

### 2.3 Session tokens are stateless drains, not persisted plaintext
Session tokens are stored only as **SHA-256 hashes** server-side; the plaintext
token lives only in the HTTP-only cookie. This is good defensive practice, but
means there is no way to recover a token's value server-side, and session
invalidation relies on deleting the hashed row. Token revocation is therefore
straightforward but not instantaneous across clients beyond the current cookie.

### 2.4 Password change revokes other sessions
Changing your password intentionally signs out every **other** session (keeping
the current one). This is a deliberate security behavior and can surprise users
who are signed in on multiple devices — it is not a bug, but it is a user-visible
limitation to document.

### 2.5 IP address / user agent trust
IP addresses are taken from `x-forwarded-for` / `x-real-ip` headers
(`auditContextFromRequest`) and stored for audit. In a non-proxied environment
these headers can be spoofed by a client; the values are informational audit
data, not security controls.

### 2.6 Cross-site / CSRF model
State-changing requests are CSRF-protected via an `Origin`/`Sec-Fetch-Site`
check plus `SameSite=Lax` cookies. `SameSite=Lax` alone does not fully cover all
browsing contexts (e.g. top-level POST navigation in some scenarios), but the
explicit origin check closes that gap. This is a defense-in-depth posture, not a
stateless token scheme.

---

## 3. Product & operational limitations

### 3.1 One account per user, one user per email
A user has exactly **one** account and one email (unique). There is no support
for multiple accounts per user, account closing, or email changes via the UI.

### 3.2 No KYC / verification / limits
There is no identity verification, no per-user transfer/deposit limits beyond
the hard caps in §1.4, no compliance or regulatory modeling. All wallets are
created `ACTIVE` and freely usable.

### 3.3 No recipients / contacts / favorites
Transfers are addressed only by raw wallet address. There is no address book,
no saved recipients, no QR linking, no bill payments or scheduled/recurring
transfers.

### 3.4 No notifications
There is no email/SMS/push notification channel. Users discover received
transactions and failures by viewing the UI; the only in-app signal is the
dashboard failed-transaction alert.

### 3.5 Cards are virtual/demo only
Cards store only a `lastFour`, a type, and an expiry — no PAN, no CVV, no real
card network. Cards cannot transact; they are display-only demo artifacts with
no payment capability, limits, or controls beyond ACTIVE/INACTIVE.

### 3.6 Audit log is append-only but not archived
`audit_logs` is append-only through the app (`writeAudit`) with no user-facing
edit/delete, but there is no retention/archival/export policy. Metadata is kept
free of secrets, but the table will grow unbounded until a retention policy is
added.

### 3.7 Demo seed provides the only non-empty dataset
Beyond real registrations, the only populated data comes from
`scripts/demo-seed.ts` (Anna, Kwame, Yawa). Reset is manual (`db-migrate.ts`
drops/recreates the public schema, then re-seeding). There is no reset button in
the product.

### 3.8 Integration tests require a separate database
`npm test` uses `TEST_DATABASE_URL`. If it points at the same database as the
app (see `TESTING.md` §1), running the suite **truncates all live data**. Until
the two URLs point at different databases, `npm test` intentionally must not be
run against the app database.

---

## 4. What is intentionally NOT included

- International / multi-currency **conversion** (single-currency only).
- Real external money movement, payments, or PSP integration.
- KYC, AML, regulatory, or compliance features.
- Notifications, email, SMS, or push.
- Recurring / scheduled / bill payments.
- Card processing (cards are demo-only).
- Multi-tenant or multi-instance scaling (in-memory rate limiting, single pool).

---

## 5. Summary

These limitations are consistent with a **financial prototype** whose purpose is
to demonstrate ledger correctness (exactly-once transfers, idempotency, atomic
failure), shared-wallet visibility, auth/session security, and an audit trail —
not to operate as a production payment system. Each limitation above is a
candidate for extension by a future production milestone.
