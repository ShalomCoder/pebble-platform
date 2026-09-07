/**
 * Pebble transaction engine.
 *
 * Financial movement happens ONLY through these functions. Route handlers
 * authenticate, validate and route; they never implement the money move.
 *
 * Design (intent + execution):
 *  1. createTransferIntent atomically reserves a transaction (status PENDING)
 *     with a unique reference (the idempotency key) and enforces the
 *     one-active-transaction-per-account rule.
 *  2. executeTransferIntent atomically locks the two wallet rows in a
 *     deterministic order, verifies funds from the locked rows, debits the
 *     sender, credits the recipient and marks the transaction COMPLETED — all
 *     inside one PostgreSQL transaction. Any failure rolls the whole thing
 *     back so no partial financial state survives.
 *
 * Idempotency:
 *  - same reference + same parameters  -> existing transaction returned, money NOT moved again
 *  - same reference + different params -> rejected (conflict), existing transaction unchanged
 *  - new reference                     -> genuinely new transaction
 *  Uniqueness of the reference is enforced by a database unique constraint.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type TransactionDb } from "../db";
import { accounts, transactions, users, wallets } from "../db/schema";
import type { TransactionRow, WalletRow } from "../db/schema";
import { isUniqueViolation, type DbClient } from "../db/client";
import { AppError, ErrorCodes } from "../errors";
import { validateWalletAddress } from "../wallet/address";
import { validateReference } from "../reference";
import { AuditActions, writeAudit, type AuditContext } from "../audit";

const ACTIVE_STATUSES = ["PENDING", "PROCESSING"] as const;
export const TERMINAL_SUCCESS = "COMPLETED";
export const TERMINAL_FAILURE = "FAILED";
const MAX_MEMO_LENGTH = 140;

const senderWallet = alias(wallets, "sender_wallet");
const recipientWallet = alias(wallets, "recipient_wallet");
const senderAccount = alias(accounts, "sender_account");
const recipientAccount = alias(accounts, "recipient_account");
const senderOwner = alias(users, "sender_owner");
const recipientOwner = alias(users, "recipient_owner");

export type TransferIntentInput = {
  reference: string;
  senderWalletId: string;
  recipientAddress: string;
  amountMinor: number;
  memo?: string;
};

export type IntentResult =
  | { mode: "new"; transaction: SerializedTransaction }
  | { mode: "resume"; transaction: SerializedTransaction }
  | { mode: "replay"; transaction: SerializedTransaction };

const TX_SELECT = {
  tx: {
    id: transactions.id,
    accountId: transactions.accountId,
    reference: transactions.reference,
    senderWalletId: transactions.senderWalletId,
    recipientWalletId: transactions.recipientWalletId,
    amount: transactions.amount,
    currency: transactions.currency,
    status: transactions.status,
    memo: transactions.memo,
    createdAt: transactions.createdAt,
    completedAt: transactions.completedAt,
    failedAt: transactions.failedAt,
    completionAcknowledgedAt: transactions.completionAcknowledgedAt,
  },
  sender: {
    id: senderWallet.id,
    accountId: senderWallet.accountId,
    address: senderWallet.address,
    name: senderWallet.name,
    currency: senderWallet.currency,
    status: senderWallet.status,
    accountName: senderOwner.fullName,
  },
  recipient: {
    id: recipientWallet.id,
    accountId: recipientWallet.accountId,
    address: recipientWallet.address,
    name: recipientWallet.name,
    currency: recipientWallet.currency,
    status: recipientWallet.status,
    accountName: recipientOwner.fullName,
  },
} as const;

type WalletWithAccountName = WalletRow & { accountName: string };

type TxWithWallets = {
  tx: TransactionRow;
  sender: WalletWithAccountName;
  recipient: WalletWithAccountName;
};

export type SerializedTransaction = ReturnType<typeof serializeTransaction>;

export function serializeTransaction(viewerAccountId: string, row: TxWithWallets) {
  const direction =
    row.sender.accountId === row.recipient.accountId && row.sender.accountId === viewerAccountId
      ? ("self" as const)
      : row.sender.accountId === viewerAccountId
        ? ("sent" as const)
        : ("received" as const);

  return {
    id: row.tx.id,
    accountId: row.tx.accountId,
    reference: row.tx.reference,
    amount: row.tx.amount,
    currency: row.tx.currency,
    status: row.tx.status,
    memo: row.tx.memo,
    direction,
    senderWallet: {
      id: row.sender.id,
      address: row.sender.address,
      name: row.sender.name,
      accountName: row.sender.accountName,
    },
    recipientWallet: {
      id: row.recipient.id,
      address: row.recipient.address,
      name: row.recipient.name,
      accountName: row.recipient.accountName,
    },
    createdAt: row.tx.createdAt,
    completedAt: row.tx.completedAt,
    failedAt: row.tx.failedAt,
    completionAcknowledgedAt: row.tx.completionAcknowledgedAt,
    needsAcknowledgement: row.tx.status === TERMINAL_SUCCESS && row.tx.completionAcknowledgedAt === null,
  };
}

async function loadTxWithWallets(client: DbClient, txId: string): Promise<TxWithWallets | null> {
  const rows = await client
    .select(TX_SELECT)
    .from(transactions)
    .innerJoin(senderWallet, eq(transactions.senderWalletId, senderWallet.id))
    .innerJoin(recipientWallet, eq(transactions.recipientWalletId, recipientWallet.id))
    .innerJoin(senderAccount, eq(senderWallet.accountId, senderAccount.id))
    .innerJoin(recipientAccount, eq(recipientWallet.accountId, recipientAccount.id))
    .innerJoin(senderOwner, eq(senderAccount.userId, senderOwner.id))
    .innerJoin(recipientOwner, eq(recipientAccount.userId, recipientOwner.id))
    .where(eq(transactions.id, txId))
    .limit(1);
  return rows[0] ? (rows[0] as unknown as TxWithWallets) : null;
}

/** Local input validation that requires no DB access. */
function validateIntentInput(input: TransferIntentInput): void {
  if (!validateReference(input.reference)) {
    throw new AppError(400, ErrorCodes.INVALID_REFERENCE, "Invalid transaction reference.");
  }
  if (typeof input.amountMinor !== "number" || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, "Amount must be a positive whole number of minor units.");
  }
  if (input.amountMinor > 1_000_000_000_000) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, "Amount exceeds the maximum allowed.");
  }
  if (!validateWalletAddress(input.recipientAddress)) {
    throw new AppError(400, ErrorCodes.WALLET_ADDRESS_INVALID, "The recipient address is not a valid Pebble address.");
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(input.senderWalletId)) {
    throw new AppError(400, ErrorCodes.WALLET_UNAUTHORIZED, "Invalid sender wallet.");
  }
  if (input.memo !== undefined && input.memo !== null) {
    if (typeof input.memo !== "string" || input.memo.trim().length === 0) {
      input.memo = undefined;
    } else if (input.memo.length > MAX_MEMO_LENGTH) {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Memo must be at most ${MAX_MEMO_LENGTH} characters.`);
    }
  }
}

function sameParameters(existing: TransactionRow, input: TransferIntentInput, senderId: string, recipientId: string): boolean {
  return (
    existing.senderWalletId === input.senderWalletId &&
    existing.recipientWalletId === recipientId &&
    existing.amount === input.amountMinor &&
    (existing.memo ?? null) === (input.memo?.trim() || null)
  );
}

/**
 * Reserves a transfer. Returns mode "new" when a row was created, "resume"
 * when an identical active transaction already exists (recovery), or "replay"
 * when an identical terminal transaction already exists. Throws on conflicts.
 */
export async function createTransferIntent(
  client: DbClient,
  accountId: string,
  input: TransferIntentInput,
  ctx: AuditContext,
): Promise<IntentResult> {
  validateIntentInput(input);
  const memo = input.memo?.trim() || null;

  // Resolve the sender wallet before the transaction: it must belong to the account.
  const senderRows = await client
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, input.senderWalletId), eq(wallets.accountId, accountId)))
    .limit(1);
  const sender = senderRows[0] ?? null;
  if (!sender) {
    throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "Sender wallet not found.");
  }
  if (sender.status !== "ACTIVE") {
    throw new AppError(422, ErrorCodes.WALLET_INACTIVE, "Sender wallet is not active.");
  }

  return client.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.reference, input.reference))
      .limit(1);
    const existing = existingRows[0] ?? null;

    if (existing) {
      const existingRecipient = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, existing.recipientWalletId))
        .limit(1);
      const recipientId = existingRecipient[0]?.id ?? input.senderWalletId;

      if (sameParameters(existing, input, sender.id, recipientId)) {
        if (existing.status === TERMINAL_SUCCESS || existing.status === TERMINAL_FAILURE) {
          return { mode: "replay" as const, transaction: serializeTransaction(accountId, (await loadTxWithWallets(tx, existing.id))!) };
        }
        // Identical reference already active → recovery resume.
        return { mode: "resume" as const, transaction: serializeTransaction(accountId, (await loadTxWithWallets(tx, existing.id))!) };
      }
      throw new AppError(
        409,
        ErrorCodes.IDEMPOTENCY_CONFLICT,
        "This reference was already used for a different transfer.",
      );
    }

    // One active transaction per account (also enforced by a partial unique index).
    const active = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), inArray(transactions.status, ACTIVE_STATUSES)))
      .limit(1);
    if (active.length > 0) {
      throw new AppError(
        409,
        ErrorCodes.ACTIVE_TRANSACTION_EXISTS,
        "You already have a transfer in progress. Resolve it before starting another.",
      );
    }

    const recipientRows = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.address, input.recipientAddress))
      .limit(1);
    const recipient = recipientRows[0] ?? null;
    if (!recipient) {
      throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "Recipient wallet not found.");
    }
    if (recipient.status !== "ACTIVE") {
      throw new AppError(422, ErrorCodes.WALLET_INACTIVE, "Recipient wallet is not active.");
    }
    if (recipient.id === sender.id) {
      throw new AppError(400, ErrorCodes.WALLET_SAME, "You cannot transfer to the same wallet.");
    }
    if (recipient.currency !== sender.currency) {
      throw new AppError(422, ErrorCodes.CURRENCY_MISMATCH, "Both wallets must use the same currency.");
    }

    try {
      const [row] = await tx
        .insert(transactions)
        .values({
          accountId,
          reference: input.reference,
          senderWalletId: sender.id,
          recipientWalletId: recipient.id,
          amount: input.amountMinor,
          currency: sender.currency,
          status: "PENDING",
          memo,
        })
        .returning();

      await writeAudit(tx, AuditActions.transaction_created, ctx, {
        resourceType: "transaction",
        resourceId: row.id,
        metadata: { reference: row.reference, amountMinor: row.amount, currency: row.currency },
      });

      return { mode: "new" as const, transaction: serializeTransaction(accountId, (await loadTxWithWallets(tx, row.id))!) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          ErrorCodes.IDEMPOTENCY_CONFLICT,
          "This reference was already used for a different transfer.",
        );
      }
      throw error;
    }
  });
}

/**
 * Executes an existing (PENDING) transfer atomically.
 *
 * Returns the serialized transaction. If money cannot move (e.g. insufficient
 * funds), the whole execution transaction rolls back and the intent is marked
 * FAILED in a separate transaction (a status marker, NOT a financial refund).
 */
export async function executeTransferIntent(
  reference: string,
  ctx: AuditContext,
): Promise<SerializedTransaction> {
  let failedBeforeCompletion = false;

  try {
    const result = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.reference, reference))
        .limit(1)
        .for("update");
      const txn = lockedRows[0] ?? null;
      if (!txn) {
        throw new AppError(404, ErrorCodes.TRANSACTION_NOT_FOUND, "Transaction not found.");
      }

      if (txn.status === TERMINAL_SUCCESS || txn.status === TERMINAL_FAILURE) {
        return serializeTransaction(txn.accountId, (await loadTxWithWallets(tx, txn.id))!);
      }

      // Lock the two wallet rows in deterministic order to reduce deadlock risk.
      const [firstId, secondId] = [txn.senderWalletId, txn.recipientWalletId].sort();
      const [firstRows, secondRows] = await Promise.all([
        tx.select().from(wallets).where(eq(wallets.id, firstId)).for("update"),
        tx.select().from(wallets).where(eq(wallets.id, secondId)).for("update"),
      ]);
      const [firstWallet, secondWallet] = [firstRows[0] ?? null, secondRows[0] ?? null];
      if (!firstWallet || !secondWallet) {
        throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "A wallet involved in this transfer no longer exists.");
      }
      const sender = firstWallet.id === txn.senderWalletId ? firstWallet : secondWallet;
      const recipient = firstWallet.id === txn.senderWalletId ? secondWallet : firstWallet;

      // Guard: only one executor transitions this transaction into PROCESSING.
      const guarded = await tx
        .update(transactions)
        .set({ status: "PROCESSING" })
        .where(and(eq(transactions.id, txn.id), inArray(transactions.status, ACTIVE_STATUSES)))
        .returning({ id: transactions.id });
      if (guarded.length === 0) {
        // Another executor finished it while we waited for the lock.
        return serializeTransaction(txn.accountId, (await loadTxWithWallets(tx, txn.id))!);
      }

      await writeAudit(tx, AuditActions.transaction_processing, ctx, {
        resourceType: "transaction",
        resourceId: txn.id,
        metadata: { reference },
      });

      // Authoritative balance check from the freshly locked rows.
      if (sender.balance < txn.amount) {
        failedBeforeCompletion = true;
        throw new AppError(
          422,
          ErrorCodes.INSUFFICIENT_FUNDS,
          "This transfer would exceed your available balance.",
        );
      }

      // Debit sender, credit recipient — integer arithmetic, same atomic block.
      await tx
        .update(wallets)
        .set({ balance: sender.balance - txn.amount, updatedAt: new Date() })
        .where(eq(wallets.id, sender.id));
      await tx
        .update(wallets)
        .set({ balance: recipient.balance + txn.amount, updatedAt: new Date() })
        .where(eq(wallets.id, recipient.id));

      await tx
        .update(transactions)
        .set({ status: TERMINAL_SUCCESS, completedAt: new Date() })
        .where(eq(transactions.id, txn.id));

      await writeAudit(tx, AuditActions.transaction_completed, ctx, {
        resourceType: "transaction",
        resourceId: txn.id,
        metadata: {
          reference,
          amountMinor: txn.amount,
          currency: txn.currency,
          senderWalletId: sender.id,
          recipientWalletId: recipient.id,
        },
      });

      return serializeTransaction(txn.accountId, (await loadTxWithWallets(tx, txn.id))!);
    });

    if (!result) {
      throw new AppError(500, ErrorCodes.INTERNAL, "Transfer could not be loaded after execution.");
    }
    return result;
  } catch (error) {
    if (failedBeforeCompletion && error instanceof AppError && error.code === ErrorCodes.INSUFFICIENT_FUNDS) {
      await markTransactionFailed(reference, "INSUFFICIENT_FUNDS", ctx);
    }
    throw error;
  }
}

/** Marks an active intent FAILED. Pure status marker; never touches balances. */
export async function markTransactionFailed(
  reference: string,
  reason: string,
  ctx: AuditContext,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.reference, reference))
      .limit(1)
      .for("update");
    const txn = rows[0] ?? null;
    if (!txn) return;
    if (txn.status !== "PENDING" && txn.status !== "PROCESSING") return;

    await tx
      .update(transactions)
      .set({ status: TERMINAL_FAILURE, failedAt: new Date() })
      .where(eq(transactions.id, txn.id));

    await writeAudit(tx, AuditActions.transaction_failure, ctx, {
      resourceType: "transaction",
      resourceId: txn.id,
      metadata: { reference, reason, amountMinor: txn.amount, currency: txn.currency },
    });
  });
}

/** Returns the account's active transaction, if any. */
export async function getActiveTransaction(
  accountId: string,
): Promise<SerializedTransaction | null> {
  const rows = await db
    .select(TX_SELECT)
    .from(transactions)
    .innerJoin(senderWallet, eq(transactions.senderWalletId, senderWallet.id))
    .innerJoin(recipientWallet, eq(transactions.recipientWalletId, recipientWallet.id))
    .innerJoin(senderAccount, eq(senderWallet.accountId, senderAccount.id))
    .innerJoin(recipientAccount, eq(recipientWallet.accountId, recipientAccount.id))
    .innerJoin(senderOwner, eq(senderAccount.userId, senderOwner.id))
    .innerJoin(recipientOwner, eq(recipientAccount.userId, recipientOwner.id))
    .where(and(eq(transactions.accountId, accountId), inArray(transactions.status, ACTIVE_STATUSES)))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  return serializeTransaction(accountId, rows[0] as unknown as TxWithWallets);
}

export type TransactionListFilters = {
  status?: string;
  walletId?: string;
  direction?: "sent" | "received" | "self";
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listTransactions(
  accountId: string,
  filters: TransactionListFilters,
): Promise<{ items: SerializedTransaction[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(transactions.accountId, accountId)];
  if (filters.status) {
    conditions.push(eq(transactions.status, filters.status));
  }
  if (filters.walletId) {
    conditions.push(
      or(
        eq(transactions.senderWalletId, filters.walletId),
        eq(transactions.recipientWalletId, filters.walletId),
      )!,
    );
  }
  if (filters.search) {
    const q = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        sql`${transactions.memo} ILIKE ${q}`,
        sql`${transactions.reference} ILIKE ${q}`,
      )!,
    );
  }

  const base = db.select(TX_SELECT).from(transactions)
    .innerJoin(senderWallet, eq(transactions.senderWalletId, senderWallet.id))
    .innerJoin(recipientWallet, eq(transactions.recipientWalletId, recipientWallet.id))
    .innerJoin(senderAccount, eq(senderWallet.accountId, senderAccount.id))
    .innerJoin(recipientAccount, eq(recipientWallet.accountId, recipientAccount.id))
    .innerJoin(senderOwner, eq(senderAccount.userId, senderOwner.id))
    .innerJoin(recipientOwner, eq(recipientAccount.userId, recipientOwner.id));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(...conditions));

  const rows = await base
    .where(and(...conditions))
    .orderBy(desc(transactions.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Direction filters must be applied in memory because direction is derived.
  let items = rows.map((r) => serializeTransaction(accountId, r as unknown as TxWithWallets));
  if (filters.direction) {
    items = items.filter((t) => t.direction === filters.direction);
  }

  return { items, total, page, pageSize };
}

/** Loads a transaction that must belong to the given account. */
export async function getTransactionForAccount(
  accountId: string,
  txId: string,
): Promise<SerializedTransaction | null> {
  const rows = await db
    .select(TX_SELECT)
    .from(transactions)
    .innerJoin(senderWallet, eq(transactions.senderWalletId, senderWallet.id))
    .innerJoin(recipientWallet, eq(transactions.recipientWalletId, recipientWallet.id))
    .innerJoin(senderAccount, eq(senderWallet.accountId, senderAccount.id))
    .innerJoin(recipientAccount, eq(recipientWallet.accountId, recipientAccount.id))
    .innerJoin(senderOwner, eq(senderAccount.userId, senderOwner.id))
    .innerJoin(recipientOwner, eq(recipientAccount.userId, recipientOwner.id))
    .where(and(eq(transactions.id, txId), eq(transactions.accountId, accountId)))
    .limit(1);
  if (rows.length === 0) return null;
  return serializeTransaction(accountId, rows[0] as unknown as TxWithWallets);
}

/**
 * Explicit acknowledgment of a completed transaction. Idempotent, requires the
 * transaction to belong to the caller, and never alters financial state.
 */
export async function acknowledgeTransaction(
  accountId: string,
  txId: string,
  ctx: AuditContext,
): Promise<SerializedTransaction> {
  const result = await db.transaction(async (tx: TransactionDb) => {
    const rows = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, txId), eq(transactions.accountId, accountId)))
      .limit(1)
      .for("update");
    const txn = rows[0] ?? null;
    if (!txn) {
      throw new AppError(404, ErrorCodes.TRANSACTION_NOT_FOUND, "Transaction not found.");
    }
    if (txn.status !== TERMINAL_SUCCESS) {
      throw new AppError(
        409,
        ErrorCodes.TRANSACTION_NOT_COMPLETED,
        "Only completed transactions can be acknowledged.",
      );
    }

    if (!txn.completionAcknowledgedAt) {
      await tx
        .update(transactions)
        .set({ completionAcknowledgedAt: new Date() })
        .where(eq(transactions.id, txn.id));
      await writeAudit(tx, AuditActions.completion_acknowledged, ctx, {
        resourceType: "transaction",
        resourceId: txn.id,
        metadata: { reference: txn.reference },
      });
    }

    return serializeTransaction(accountId, (await loadTxWithWallets(tx, txn.id))!);
  });

  return result!;
}