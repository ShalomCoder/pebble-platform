# Pebble Platform — API Documentation

This document describes the HTTP API for the Pebble financial prototype.

The API follows REST conventions with a uniform JSON envelope, cookie-based
session authentication, CSRF protection on state-changing requests, and
centralized server-side validation. All amounts are transmitted as **integer
minor currency units** (e.g. `5000` = `50.00` GHS). Floating point is never
used for money.

---

## Base URL

There is no global API prefix. All endpoints are served from the application
root, e.g. `https://your-app.example.com/api/...`.

- Local development: `http://localhost:3000`
- Deployed Vercel site: uses the site's domain

All routes are server-rendered Next.js Route Handlers under `src/app/api/`.

---

## Response Envelope

Every endpoint returns one of two shapes:

**Success**

```json
{
  "data": { }
}
```

**Error**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "A human-readable, safe-to-show message."
  }
}
```

Error codes use SCREAMING_SNAKE_CASE. Messages are intentionally generic and
never leak stack traces, SQL, password hashes, or session secrets.

### HTTP status codes

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `201` | Created (resource persisted) |
| `400` | Validation failure or bad request |
| `401` | Not authenticated |
| `403` | CSRF / cross-site request rejected |
| `404` | Resource not found (or hidden) |
| `409` | Conflict (e.g. duplicate email) |
| `422` | Validation failure (business-rule level) |
| `429` | Rate limited |
| `500` | Internal error |

### Error codes

| Code | Meaning |
|------|---------|
| `AUTH_REQUIRED` | No valid session |
| `INVALID_CREDENTIALS` | Wrong email/password or current password |
| `INVALID_SESSION` | Session invalid/expired |
| `RATE_LIMITED` | Too many requests |
| `VALIDATION_ERROR` | Input failed server-side validation |
| `EMAIL_TAKEN` | Email already registered |
| `ACCOUNT_NOT_FOUND` | No account for the user |
| `WALLET_NOT_FOUND` | Wallet not found or not owned |
| `WALLET_UNAUTHORIZED` | Operation not allowed on the wallet |
| `WALLET_SAME` | Cannot transfer between identical wallets |
| `WALLET_INACTIVE` | Wallet is not active |
| `WALLET_ADDRESS_INVALID` | Address format invalid |
| `CURRENCY_MISMATCH` | Sender/recipient currencies differ |
| `INSUFFICIENT_FUNDS` | Sender lacks the balance to complete a transfer |
| `INVALID_REFERENCE` | Transaction reference malformed |
| `IDEMPOTENCY_CONFLICT` | Reference reused with different parameters |
| `ACTIVE_TRANSACTION_EXISTS` | Already have a transfer in progress |
| `TRANSACTION_NOT_FOUND` | Transaction not found/not owned |
| `TRANSACTION_NOT_COMPLETED` | Acknowledge called on non-completed tx |
| `TRANSACTION_FAILED` | Transfer failed |
| `CARD_NOT_FOUND` | Card not found/not owned |
| `INTERNAL` | Unexpected server error |

---

## Authentication

Authentication is **cookie-based**. On login or registration the server returns
an opaque random session token in an HTTP-only, `SameSite=Lax` cookie named
`pebble_session`. The server stores only a SHA-256 hash of the token.

- The client must send the cookie on every request (`credentials: "same-origin"`).
- The authenticated user is always resolved server-side from the session. **User
  IDs, account IDs, and wallet IDs supplied by the client are never trusted** to
  identify the caller — they are only used after ownership is verified against
  the authenticated account.

### Why raw curl may get 403

For state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`), the server
rejects cross-site requests. It verifies the `Origin` (or `Sec-Fetch-Site`)
header matches the application's own origin. When testing with `curl`, send a
matching header:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"you@example.com","password":"..."}'
```

---

## Conventions

### Money

- Amounts are integers in minor units (e.g. `5000` minor = `50.00` major).
- `amountMinor` for sends/deposits must be `> 0`.
- Max transfer amount: `1_000_000_000_000` minor units.
- Max demo deposit: `100_000_000_00` (100,000 major units) per call.

### Currencies

`GHS`, `USD`, `EUR`, `GBP` are supported.

### Wallet addresses

11-digit numeric strings (9 identity digits + 2 checksum digits), e.g.
`84739162520`.

### Transaction references

The idempotency key for a transfer, formatted `PB-XXXXXXXX-XXXX`
(upper-case `[0-9A-Z]`), e.g. `PB-1A2B3C4D-5E6F`. Reuse the same reference to
retry the same logical transfer — the server will not move money twice.

---

## Endpoints

### Auth

#### `POST /api/auth/register` — Create account + session

Creates a user, their account, and a default `GHS` "Main wallet" atomically. Sets
a session cookie.

**Request**
```json
{
  "fullName": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "secret123"
}
```

**Validation**
- `fullName`: 2–80 chars.
- `email`: valid email, `<= 254` chars, lowercased.
- `password`: 8–72 chars, must contain at least one letter and one number.

**Response `201`**
```json
{
  "data": {
    "user": { "id": "…", "fullName": "Ada Lovelace", "email": "ada@example.com", "createdAt": "…" },
    "account": { "id": "…", "publicCode": "560746", "status": "ACTIVE" },
    "defaultWallet": { "id": "…", "address": "84739162520", "name": "Main wallet", "currency": "GHS", "balance": 0 }
  }
}
```

**Errors**: `409 EMAIL_TAKEN`, `400 VALIDATION_ERROR`.

**Rate limit**: 10 / minute.

---

#### `POST /api/auth/login` — Sign in

Verifies credentials (with timing-equalizing dummy hash for unknown emails so
response time does not leak whether an email exists) and sets a session cookie.

**Request**
```json
{ "email": "ada@example.com", "password": "secret123" }
```

**Response `200`**
```json
{
  "data": { "user": { "id": "…", "fullName": "Ada Lovelace", "email": "ada@example.com", "createdAt": "…" } }
}
```

**Errors**: `401 INVALID_CREDENTIALS` (single generic message whether the email
or password is wrong). `400 VALIDATION_ERROR`.

**Rate limit**: 10 / minute.

---

#### `POST /api/auth/logout` — Sign out

Deletes the current session server-side, clears the cookie, and records a
`logout` audit entry.

**Request**: no body.

**Response `200`**
```json
{ "data": { "loggedOut": true } }
```

Requires authentication.

---

#### `GET /api/auth/me` — Current user

Returns the authenticated user's profile.

**Response `200`**
```json
{
  "data": { "user": { "id": "…", "fullName": "Ada Lovelace", "email": "ada@example.com", "createdAt": "…" } }
}
```

**Errors**: `401 AUTH_REQUIRED`.

---

#### `PATCH /api/auth/profile` — Update full name

Updates the authenticated user's full name.

**Request**
```json
{ "fullName": "Ada King" }
```

**Validation**: `fullName` 2–80 chars.

**Response `200`**
```json
{ "data": { "fullName": "Ada King" } }
```

Records a `account_updated` audit entry. Requires authentication.

---

#### `POST /api/auth/password` — Change password

Verifies the current password, then updates to a new Argon2id hash. On success,
all **other** sessions are revoked (the current session is retained).

**Request**
```json
{
  "currentPassword": "secret123",
  "newPassword": "newSecret456",
  "confirmPassword": "newSecret456"
}
```

**Validation**: `newPassword` 8–72 chars with a letter and a number; must equal
`confirmPassword`.

**Response `200`**
```json
{ "data": { "updated": true } }
```

**Errors**:
- `400 INVALID_CREDENTIALS` — current password is incorrect (generic message).
- `400 VALIDATION_ERROR` — e.g. "New passwords do not match."

Records a `password_changed` audit entry (and `session_invalidated` if other
sessions were removed). Requires authentication.

---

#### `POST /api/auth/sign-out-others` — Revoke other sessions

Deletes every session belonging to the user except the current one.

**Request**: no body.

**Response `200`**
```json
{ "data": { "signedOut": 3 } }
```

Records a `session_invalidated` audit entry when any sessions are removed.
Requires authentication.

---

### Account

#### `GET /api/account` — Account overview

Returns the authenticated user's account with its wallets.

**Response `200`**
```json
{
  "data": {
    "account": { "id": "…", "publicCode": "560746", "status": "ACTIVE" },
    "user": { "id": "…", "fullName": "Ada Lovelace", "email": "ada@example.com" },
    "wallets": [
      {
        "id": "…",
        "address": "84739162520",
        "name": "Main wallet",
        "currency": "GHS",
        "balance": 5000,
        "status": "ACTIVE",
        "createdAt": "…",
        "updatedAt": "…"
      }
    ]
  }
}
```

Requires authentication.

---

### Wallets

#### `GET /api/wallets` — List wallets

Lists the authenticated account's active wallets (newest first).

**Response `200`**
```json
{
  "data": {
    "wallets": [
      {
        "id": "…",
        "address": "84739162520",
        "name": "Main wallet",
        "currency": "GHS",
        "balance": 5000,
        "status": "ACTIVE",
        "createdAt": "…",
        "updatedAt": "…"
      }
    ]
  }
}
```

Requires authentication.

---

#### `POST /api/wallets` — Create a wallet

Creates a new wallet in the authenticated account, regenerating the address on
collision until unique. Default balance is `0`.

**Request**
```json
{ "name": "Savings", "currency": "USD" }
```

**Validation**
- `name`: 1–40 chars.
- `currency`: one of `GHS | USD | EUR | GBP`.

**Response `201`**
```json
{
  "data": {
    "wallet": { "id": "…", "address": "…", "name": "Savings", "currency": "USD", "balance": 0, "status": "ACTIVE", "createdAt": "…", "updatedAt": "…" }
  }
}
```

Records a `wallet_created` audit entry. Requires authentication.

---

#### `GET /api/wallets/[id]` — Wallet detail

Returns one of the caller's wallets, its 10 most recent transactions, and its
cards. The wallet must belong to the authenticated account.

**Response `200`**
```json
{
  "data": {
    "wallet": {
      "id": "…",
      "address": "…",
      "name": "Main wallet",
      "currency": "GHS",
      "balance": 5000,
      "status": "ACTIVE",
      "createdAt": "…",
      "updatedAt": "…",
      "accountPublicCode": "560746"
    },
    "transactions": [ /* see Transaction object */ ],
    "cards": [ /* see Card object */ ]
  }
}
```

**Errors**: `404 WALLET_NOT_FOUND`. Requires authentication.

---

### Transactions

A transfer has these stages: `PENDING` → `PROCESSING` → `COMPLETED`, or
`PENDING`/`PROCESSING` → `FAILED`.

The **Transaction object** (serialized) shape:

```json
{
  "id": "…",
  "accountId": "…",
  "reference": "PB-1A2B3C4D-5E6F",
  "amount": 5000,
  "currency": "GHS",
  "status": "COMPLETED",
  "memo": "Rent",
  "direction": "sent",
  "senderWallet": { "id": "…", "address": "…", "name": "Main wallet", "accountName": "Ada Lovelace" },
  "recipientWallet": { "id": "…", "address": "…", "name": "Main wallet", "accountName": "Grace Hopper" },
  "createdAt": "…",
  "completedAt": "…",
  "failedAt": null,
  "failedReason": null,
  "completionAcknowledgedAt": null,
  "needsAcknowledgement": true
}
```

`direction` is one of `sent | received | self`, derived relative to the viewing
account. `failedReason` is non-null only when `status === "FAILED"` (e.g.
`INSUFFICIENT_FUNDS`).

---

#### `POST /api/transactions` — Initialize and execute a transfer

The single entry point for sending money. It atomically creates the intent
(PENDING) and immediately executes it (debit sender / credit recipient), or
resumes/replays an existing intent keyed by the same `reference`.

**Request**
```json
{
  "reference": "PB-1A2B3C4D-5E6F",
  "senderWalletId": "…",
  "recipientAddress": "84739162520",
  "amountMinor": 5000,
  "memo": "Rent"
}
```

**Validation**
- `reference`: must match `PB-XXXXXXXX-XXXX`.
- `amountMinor`: positive integer, `<= 1_000_000_000_000`.
- `recipientAddress`: valid wallet address.
- `memo`: optional, `<= 140` chars.

**Behavior & idempotency**
- Same `reference` + same parameters → returns the existing transaction (mode `resume`/`replay`), money not moved again.
- Same `reference` + different parameters → `409 IDEMPOTENCY_CONFLICT`.
- Only one active (`PENDING`/`PROCESSING`) transaction per account.

**Response `201`**
```json
{ "data": { "transaction": { /* Transaction object */ } } }
```

**Common errors**
- `409 ACTIVE_TRANSACTION_EXISTS` — a transfer is already in progress.
- `409 IDEMPOTENCY_CONFLICT`.
- `422 INSUFFICIENT_FUNDS` — balance check failed at execution; the transaction
  is marked `FAILED`.
- `404 WALLET_NOT_FOUND` — sender or recipient missing.
- `422 CURRENCY_MISMATCH`, `422 WALLET_INACTIVE`, `400 WALLET_SAME`.

**Rate limit**: 30 / minute.

---

#### `GET /api/transactions` — List transactions

Lists transactions that involve the authenticated account as **sender OR
recipient** (newest first), with optional filters.

**Query parameters**

| Param | Values |
|-------|--------|
| `page` | `1`-based page number (default `1`) |
| `pageSize` | page size (default `20`, max `50`) |
| `status` | `COMPLETED`, `PENDING`, `PROCESSING`, or `FAILED` |
| `direction` | `sent`, `received`, or `self` |
| `walletId` | a wallet belonging to the account |
| `search` | matches `memo` or `reference` (ILIKE) |

**Response `200`**
```json
{
  "data": {
    "items": [ /* Transaction objects */ ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

Note: `direction` filtering is applied in memory after the SQL query, because
direction is derived from ownership.

Requires authentication.

---

#### `GET /api/transactions/active` — Active transfer

Returns the authenticated account's active (`PENDING`/`PROCESSING`) transaction,
or `null`. Used by the client to recover interrupted transfers.

**Response `200`**
```json
{ "data": { "transaction": { /* Transaction object */ } } }
```
(or `"transaction": null`)

Requires authentication.

---

#### `GET /api/transactions/[id]` — Transaction detail

Returns one transaction that involves the authenticated account (as sender or
recipient).

**Response `200`**
```json
{ "data": { "transaction": { /* Transaction object */ } } }
```

**Errors**: `404 TRANSACTION_NOT_FOUND` (does not reveal whether another user's
transaction exists). Requires authentication.

---

#### `POST /api/transactions/[id]/acknowledge` — Acknowledge completion

Explicit user acknowledgment of a completed transaction. Idempotent and never
alters financial state — it only sets `completionAcknowledgedAt`.

**Request**: no body.

**Response `200`**
```json
{ "data": { "transaction": { /* Transaction object */ } } }
```

**Errors**: `404 TRANSACTION_NOT_FOUND`, `409 TRANSACTION_NOT_COMPLETED`.
Records a `completion_acknowledged` audit entry. Requires authentication.

---

### Virtual Cards

Cards are demo/virtual. Real PANs and CVVs are never stored — only a `lastFour`
and a type. The **Card object** shape:

```json
{
  "id": "…",
  "walletId": "…",
  "walletName": "Main wallet",
  "walletAddress": "84739162520",
  "lastFour": "4821",
  "cardType": "VISA",
  "status": "ACTIVE",
  "createdAt": "…",
  "expiresAt": "…"
}
```

`cardType` is one of `VISA | MASTERCARD | VERVE`.

#### `GET /api/cards` — List cards

Lists all cards attached to the authenticated account's wallets.

**Response `200`**
```json
{ "data": { "cards": [ /* Card objects */ ] } }
```

Requires authentication.

---

#### `POST /api/cards` — Create a card

Creates a virtual card on a wallet the caller owns. If `cardType` is omitted or
invalid, a type is chosen at random.

**Request**
```json
{ "walletId": "…", "cardType": "VISA" }
```

**Response `201`**
```json
{ "data": { "card": { /* Card object */ } } }
```

**Errors**: `404 WALLET_NOT_FOUND`. Records a `card_created` audit entry.
Requires authentication.

---

#### `POST /api/cards/[id]/deactivate` — Deactivate a card

Deactivates one of the caller's cards. Idempotent — deactivating an already
inactive card returns it unchanged.

**Request**: no body.

**Response `200`**
```json
{ "data": { "card": { /* Card object with "status": "INACTIVE" */ } } }
```

**Errors**: `404 CARD_NOT_FOUND`. Records a `card_deactivated` audit entry.
Requires authentication.

---

### Demo Funding

> Prototype convenience. NOT part of the transfer engine. When demo funding is
> disabled (`PEBBLE_ENABLE_DEMO_FUNDING=false`) this endpoint behaves as if it
> does not exist and returns `404`.

#### `POST /api/demo/fund` — Add demo funds

Adds funds to one of the caller's wallets for prototyping.

**Request**
```json
{ "walletId": "…", "amountMinor": 5000 }
```

**Validation**
- `amountMinor`: positive integer, `<= 100_000_000_00` (100,000 major units).

**Response `200`**
```json
{ "data": { "funded": { "walletId": "…", "amountMinor": 5000, "currency": "GHS" } } }
```

Records a `demo_funding` audit entry. Requires authentication.

---

## Authentication & Authorization model

- The authenticated user is derived **only** from the server-side session cookie.
- Every protected resource's ownership is re-verified server-side against the
  authenticated account (`requireOwnedWallet`, `getTransactionForAccount`,
  `requireOwnedCard`, etc.).
- Client-supplied identifiers are treated as untrusted references, never as proof
  of identity.

## Security notes

- Passwords are hashed with **Argon2id** (18 MiB, 2 iterations). Plaintext is
  never stored or logged.
- Session tokens are stored only as SHA-256 hashes server-side; the plaintext
  token lives only in the HTTP-only `SameSite=Lax` cookie.
- State-changing requests are CSRF-protected via an `Origin`/`Sec-Fetch-Site`
  check and `SameSite=Lax` cookies.
- Login uses a timing-equalizing dummy hash and a single generic error message.
- Failure reasons (e.g. `INSUFFICIENT_FUNDS`) are surfaced to the client only for
  the user's own transactions.
- Server responses never include password hashes, session secrets, internal IDs
  beyond what is necessary, stack traces, or raw database errors.
