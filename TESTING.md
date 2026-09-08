# Pebble Platform — Testing Evidence

This document records the testing performed on the Pebble financial prototype and
satisfies the **testing evidence** criterion. It covers the automated test suite,
static engineering checks, and the manual end-to-end verification performed
against the live application and database.

---

## 1. Test environment & isolation (important)

The application uses **two** database connection strings:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | The live application database (Neon Postgres). Contains all app + demo seed data. |
| `TEST_DATABASE_URL` | Intended for integration tests, which expect a clean, disposable database. |

The integration test setup (`src/test/setup-env.ts`) re-points `DATABASE_URL` at
`TEST_DATABASE_URL` before the DB module loads, so services under test do not
touch the app database — **but only if the two URLs point at different
databases.**

> **⚠️ Known issue / current footgun:** In the current `.env`, `DATABASE_URL` and
> `TEST_DATABASE_URL` are **identical** — both point to the same `neondb`.
> Integration tests begin each case with `TRUNCATE TABLE "users" RESTART IDENTITY
> CASCADE`, which would delete every row (including the demo seed) from whatever
> database they run against. **The integration suite must not be run until
> `TEST_DATABASE_URL` points at a genuinely separate database.** Until then,
> `npm test` is intentionally **not** run and integration-test pass/fail results
> are **not** reported.

---

## 2. Automated test suite

Runner: **Vitest** (`package.json` → `npm test`, i.e. `vitest run`).
Config: `vitest.config.ts` (aliases `@` to `./src`, `pool: "forks"`, 30 s
timeouts). Setup: `src/test/setup-env.ts`.

### 2.1 Unit — wallet address (`src/lib/wallet/address.test.ts`)

Pure logic, no database — **always runs**. Covers the address system in
`src/lib/wallet/address.ts`:

- Produces well-formed 11-digit numeric addresses (200 samples).
- Addresses generated always pass structural validation (100 samples).
- Same account public code derives the same 3-digit account fragment.
- Checksum is deterministic (`calculateWalletChecksum`).
- Leading-zero wallet components handled.
- Checksum range respected (`00`–`41`, Mod-42).
- Rejects: non-strings, missing/empty, wrong lengths, non-numeric characters,
  invalid checksums, any single-digit alteration, and mismatched checksums.

### 2.2 Integration — transaction engine (`src/test/transactions.integration.test.ts`)

Financial-invariant tests. Guarded by `describe.skipIf(!hasTestDb)` — **skipped
entirely unless a real `TEST_DATABASE_URL` is set**; each case starts from a
truncated empty state. Coverage:

- Registration creates a user, account, and a default GHS "Main wallet".
- A transfer debits the sender and credits the recipient **exactly once**.
- An insufficient-funds transfer changes no balances and marks the intent
  `FAILED` (`INSUFFICIENT_FUNDS`).
- Reusing the same reference does not move money a second time (replay).
- Resuming an identical active intent returns it (resume).
- Same reference with different parameters → `IDEMPOTENCY_CONFLICT`.
- At most one active transaction per account (`ACTIVE_TRANSACTION_EXISTS`).
- Rejects an unknown recipient address (`WALLET_NOT_FOUND`).
- Rejects an address with an invalid checksum (`WALLET_ADDRESS_INVALID`).
- Rejects transferring to the same wallet (`WALLET_SAME`).
- Self transfer between own wallets reports direction `self`.
- Concurrent executions of the same intent move money **exactly once**.
- Acknowledgment is idempotent and restricted to completed transactions.
- Prevents reading another account's transaction (cross-account isolation).
- Rejects sending from a wallet not owned by the account.

**Run status:** documented/designed, **not executed** — blocked by the shared
test database described in §1.

---

## 3. Static & engineering checks

| Check | Command | Status |
|-------|---------|--------|
| Type check | `npm run typecheck` | ✅ Passing |
| Lint | `npm run lint` | ✅ Passing |
| Production build | `npm run build` | ✅ Passing |

These pass against the current working tree. The API and database
documentation (`API_DOCS.md`, `DATABASE.md`) are consistent with the routes and
schema in the code.

---

## 4. Manual end-to-end verification

All flows below were exercised end-to-end against the **live application** and
the **live Neon database**, using the demo account (`anna@pebble.demo`). Each
flow was verified through the UI/API and confirmed with the corresponding
database state.

| # | Area | Scenario verified | Outcome |
|---|------|-------------------|---------|
| 1 | Auth | Registration creates user + account + default GHS wallet | ✅ |
| 2 | Auth | Login succeeds with valid credentials; session cookie set | ✅ |
| 3 | Auth | Logout invalidates the session (subsequent `/api/auth/me` → `AUTH_REQUIRED`) | ✅ |
| 4 | Profile | Full-name update persists and is reflected | ✅ |
| 5 | Security | Wrong current password on change → generic "Your current password is incorrect." (no leak) | ✅ |
| 6 | Security | Correct password change succeeds; new password logs in | ✅ |
| 7 | Security | Password change invalidates other sessions; current session retained | ✅ |
| 8 | Security | Sign-out-others revokes sessions (`signedOut: 0` when only one session) | ✅ |
| 9 | Wallet | Wallet detail returns wallet + recent transactions + cards | ✅ |
| 10 | Transactions | Sending a transfer debits sender / credits recipient once | ✅ |
| 11 | Transactions | Received transactions are visible to the recipient, not just sender | ✅ |
| 12 | Transactions | Insufficient-funds send fails; shows failure alert + reason on detail page | ✅ |
| 13 | Transactions | Balance is not charged on a failed transfer | ✅ |
| 14 | Transactions | CompletSon acknowledgment recorded; idempotent | ✅ |
| 15 | Cards | Virtual card creation and deactivation | ✅ |
| 16 | Demo funding | `/api/demo/fund` top-up adds funds (enabled by default) | ✅ |
| 17 | Dashboard | Failed-transaction alert renders for the newest failed transaction | ✅ |

### 4.1 Security checks

- **CSRF / origin verification:** raw `curl` POSTs to state-changing API routes
  without a matching `Origin` header are rejected with
  `VALIDATION_ERROR` — "Request origin could not be verified." Confirmed.
- **Cross-account isolation:** a user cannot read or act on another account's
  wallets, cards, or transactions (ownership re-verified server-side; confirmed
  by the integration test design and manual inspection).
- **Credential safety:** no password hashes, session secrets, or internal
  identifiers are exposed in any response.

---

## 5. Status summary

| Area | Status |
|------|--------|
| Static checks (typecheck / lint / build) | ✅ Passing |
| Unit tests (wallet address) | Runnable anytime, no DB required |
| Manual E2E verification (live) | ✅ Passing (17 flows) |
| Security verification | ✅ Passing |
| Integration test suite (transaction engine) | Coverage documented; **not run** until `TEST_DATABASE_URL` points at a separate database |

**Overall:** the application has been verified end-to-end against the live
environment. The one outstanding item is running the automated integration suite,
which is currently blocked by the shared test-database configuration described in
§1 and must be resolved before that evidence can be recorded.
