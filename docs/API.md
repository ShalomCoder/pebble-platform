# API reference

Base URL: `http://localhost:3000` (dev). All routes live under `/api`.

## Conventions

- **Envelope**: success `{ "data": … }`; failure `{ "error": { "code": string, "message": string } }`.
- **Auth**: session via cookie `pebble_session`. Protected routes return `401 AUTH_REQUIRED` when missing/expired.
- **CSRF**: every non-GET request must send a matching `Origin` header for the host; otherwise `403 CROSS_ORIGIN`.
- **Money**: amounts are integer minor units (e.g. `1500` = 15.00 GHS).
- **Rate limits** (in-memory, per IP): register/login `10/min`, transfers `30/min`. Exceeded → `429 RATE_LIMITED`.
- **Errors**: `AppError` carries a stable code. Validation errors use `400`/`422` with codes such as `VALIDATION_ERROR`.

## Error codes

`AUTH_REQUIRED`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `CROSS_ORIGIN`, `RATE_LIMITED`,
`VALIDATION_ERROR`, `INVALID_REFERENCE`, `INVALID_ADDRESS`, `WALLET_ADDRESS_INVALID`,
`WALLET_NOT_FOUND`, `WALLET_SAME`, `WALLET_UNAUTHORIZED`, `ACCOUNT_NOT_FOUND`,
`CURRENCY_MISMATCH`, `INSUFFICIENT_FUNDS`, `CARD_NOT_FOUND`, `CARD_INACTIVE`,
`TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_COMPLETED`, `IDEMPOTENCY_CONFLICT`,
`ACTIVE_TRANSACTION_EXISTS`, `INTERNAL`.

---

## Auth

### `POST /api/auth/register` — create account

Body: `{ fullName, email, password, confirmPassword?, honeypot? }`

Creates the user, an account, and a default **GHS** wallet atomically. Sets the session cookie.

```json
{ "data": { "user": { "id": "…", "fullName": "…", "email": "…", "createdAt": "ISO" }, "account": { "id": "…", "publicCode": "123456" } } }
```

409 `EMAIL_TAKEN` if the email exists.

### `POST /api/auth/login`

Body: `{ email, password }`

Generic error `401 INVALID_CREDENTIALS` regardless of whether the email exists. Sets the session cookie. Response: `{ "data": { "user": { … } } }`.

### `POST /api/auth/logout`

Destroys the current session. Response `{ "data": { "ok": true } }`.

### `GET /api/auth/me`

Returns `{ "data": { "user": { id, fullName, email, createdAt } } }` or `401`.

---

## Account & wallets

### `GET /api/account`

Returns the caller's account and all wallets: `{ "data": { "account": { "id", "publicCode" }, "wallets": [Wallet] } }`.

### `GET /api/wallets`

Returns `{ "data": { "wallets": [Wallet] } }`.

```json
{ "id": "uuid", "accountId": "uuid", "name": "Main wallet", "address": "84739162520", "currency": "GHS", "balance": 1500, "createdAt": "ISO" }
```

### `POST /api/wallets`

Body: `{ name?, currency? }` (defaults: name `"Main wallet"`, currency `GHS`; whitelist `GHS|USD|EUR|GBP`).

Creates a wallet with a unique 11-digit checksummed address. `201 { "data": { "wallet": Wallet } }`.

### `GET /api/wallets/:id`

`{ "data": { "wallet": Wallet } }`, or `404 WALLET_NOT_FOUND` when the wallet isn't in the caller's account.

### `PATCH /api/wallets/:id`

Body: optional `{ name }`. Renames the wallet.

---

## Transactions

### `POST /api/transactions` — create & execute a transfer

Body:

```json
{
  "reference": "PB-2024ABCD-TEST",
  "senderWalletId": "uuid",
  "recipientAddress": "84739162520",
  "amountMinor": 1500,
  "memo": "lunch (optional, ≤ 140 chars)"
}
```

**The reference is the idempotency key.** Behavior:

| Situation | Result |
| --- | --- |
| New intent | Executes immediately; `201 { data: { transaction } }` |
| Same reference + same params | Replays/returns the existing terminal transaction; **no money moves again** |
| Same reference + different params | `409 IDEMPOTENCY_CONFLICT` |
| Reference already active | Only one active transaction per account; `409 ACTIVE_TRANSACTION_EXISTS` |

Also validated: null/empty string sender wallet (`400 WALLET_UNAUTHORIZED`), invalid checksum address (`400 WALLET_ADDRESS_INVALID`), unknown address (`404 WALLET_NOT_FOUND`), sender wallet not owned by the account (`404 WALLET_NOT_FOUND`), transferring to the same wallet (`409 WALLET_SAME`), currency mismatch (`409 CURRENCY_MISMATCH`), amount ≤ 0 or > 1e12 (`422 VALIDATION_ERROR`).

On insufficient funds the balances are unchanged, the intent is marked failed, and the response is `409 INSUFFICIENT_FUNDS`.

`transaction` shape:

```json
{
  "id": "uuid",
  "reference": "PB-…",
  "status": "COMPLETED",
  "amount": 1500,
  "currency": "GHS",
  "memo": "lunch",
  "direction": "sent" | "received" | "self",
  "senderWallet": { "id": "uuid", "address": "…", "name": "…" },
  "recipientWallet": { "id": "uuid", "address": "…", "name": "…" },
  "createdAt": "ISO",
  "completedAt": "ISO" | null,
  "failedAt": "ISO" | null,
  "completionAcknowledgedAt": "ISO" | null,
  "needsAcknowledgement": true
}
```

`status`: `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`.

### `GET /api/transactions`

Query params (all optional): `page` (default 1), `pageSize` (default 20), `status`, `direction` (`sent|received|self`), `walletId`, `search` (matches reference/memo/addresses).

`{ "data": { "items": [Transaction], "total": 3, "page": 1, "pageSize": 20 } }`

### `GET /api/transactions/active`

Returns the caller's in-flight transaction if any, else empty:

```json
{ "data": { "transaction": Transaction | null } }
```

If it is still active and `needsAcknowledgement` is not forcing completion, the monitor considers it **resumable** (this is the "Did something go wrong?" state).

### `GET /api/transactions/:id`

`{ "data": { "transaction": Transaction } }` or `404 TRANSACTION_NOT_FOUND` (includes cross-account reads).

### `POST /api/transactions/:id/acknowledge`

Marks a `COMPLETED` transaction as acknowledged. Idempotent. Returns the updated transaction with `completionAcknowledgedAt` set and `needsAcknowledgement: false`. Non-completed → `409 TRANSACTION_NOT_COMPLETED`. Used by the transaction monitor's **Got it** action.

---

## Cards

### `GET /api/cards`

`{ "data": { "cards": [Card] } }`.

```json
{ "id": "uuid", "walletId": "uuid", "lastFour": "4231", "cardType": "VIRTUAL" | "PHYSICAL", "status": "ACTIVE" | "INACTIVE", "expiresAt": "ISO", "createdAt": "ISO" }
```

### `POST /api/cards`

Body: `{ walletId, cardType? }` (`cardType` default `VIRTUAL`). Issues a card against one of the caller's wallets. `201 { data: { card } }`.

### `GET /api/cards/:id`

`{ "data": { "card": Card } }` or `404 CARD_NOT_FOUND` (cross-account too).

### `PATCH /api/cards/:id`

Body: none required. Same as `POST /api/cards/:id/deactivate`. Returns updated card. Use whichever you prefer.

### `POST /api/cards/:id/deactivate`

Deactivates an `ACTIVE` card. Returns updated card `{ "data": { "card": Card } }`. Already inactive → `409 CARD_INACTIVE`.

---

## Demo only

### `POST /api/demo/fund`

Body: `{ walletId, amountMinor }`.

Only enabled when `PEBBLE_ENABLE_DEMO_FUNDING=true` **and** not production — otherwise `404`. Credits the caller's wallet. `{ "data": { "wallet": Wallet } }`. Never enable in production.