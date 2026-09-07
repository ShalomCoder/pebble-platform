import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  jsonb,
  char,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Pebble relational schema.
 *
 * Money is stored as an integer number of minor currency units (BIGINT).
 * Floats are never used for money.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** SHA-256 hex of the opaque session token. The plaintext token is only stored in the cookie. */
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  /** Opaque public identifier. Never expose sequential DB ids as public identifiers. */
  publicCode: text("public_code").notNull().unique(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    /** Globally unique 11-digit Pebble address (9 identity digits + 2 checksum digits). */
    address: text("address").notNull().unique(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    /** Integer minor currency units. Never negative. */
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("wallet_balance_nonnegative", sql`${table.balance} >= 0`),
    check("wallet_currency_whitelist", sql`${table.currency} in ('GHS','USD','EUR','GBP')`),
    index("wallets_account_idx").on(table.accountId),
    index("wallets_currency_idx").on(table.currency),
  ],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id),
    /** Last four digits of the virtual card. Real PANs and CVV are never stored. */
    lastFour: text("last_four").notNull(),
    cardType: text("card_type").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("cards_wallet_idx").on(table.walletId),
    check("cards_type_whitelist", sql`${table.cardType} in ('VISA','MASTERCARD','VERVE')`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The initiating (sender) account. Used for the one-active-transaction rule. */
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    /** Idempotency key. Enforced unique at the database level. */
    reference: text("reference").notNull().unique(),
    senderWalletId: uuid("sender_wallet_id")
      .notNull()
      .references(() => wallets.id),
    recipientWalletId: uuid("recipient_wallet_id")
      .notNull()
      .references(() => wallets.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | PROCESSING | COMPLETED | FAILED
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    completionAcknowledgedAt: timestamp("completion_acknowledged_at", { withTimezone: true }),
  },
  (table) => [
    check("tx_amount_positive", sql`${table.amount} > 0`),
    check("tx_sender_not_recipient", sql`${table.senderWalletId} <> ${table.recipientWalletId}`),
    check("tx_status_whitelist", sql`${table.status} in ('PENDING','PROCESSING','COMPLETED','FAILED')`),
    /** One active (PENDING/PROCESSING) transaction per account, enforced by the database. */
    uniqueIndex("one_active_transaction_per_account")
      .on(table.accountId)
      .where(sql`${table.status} in ('PENDING','PROCESSING')`),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_status_idx").on(table.status),
    index("transactions_sender_idx").on(table.senderWalletId),
    index("transactions_recipient_idx").on(table.recipientWalletId),
    index("transactions_created_idx").on(table.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_user_idx").on(table.userId),
    index("audit_action_idx").on(table.action),
    index("audit_created_idx").on(table.createdAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;