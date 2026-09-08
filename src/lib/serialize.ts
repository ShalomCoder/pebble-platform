/**
 * Serializers for data handed from server components to client components.
 *
 * RSC serializes Date objects to ISO strings across the boundary, and DB
 * string columns need to be narrowed to their union types. These helpers make
 * that conversion (and its intent) explicit in the server pages.
 */
import type { WalletRow } from "./db/schema";
import type { CurrencyCode } from "./currency";
import type { SerializedTransaction as ServerTx } from "./transactions/service";
import type {
  SerializedWallet,
  SerializedTransaction,
  TransactionDirection,
  TransactionStatus,
} from "./client/types";

export function clientWallet(row: WalletRow): SerializedWallet {
  return {
    id: row.id,
    address: row.address,
    name: row.name,
    currency: row.currency as CurrencyCode,
    balance: row.balance,
    status: row.status as "ACTIVE" | "INACTIVE",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function clientTransaction(tx: ServerTx): SerializedTransaction {
  return {
    id: tx.id,
    accountId: tx.accountId,
    reference: tx.reference,
    amount: tx.amount,
    currency: tx.currency as CurrencyCode,
    status: tx.status as TransactionStatus,
    memo: tx.memo,
    direction: tx.direction as TransactionDirection,
    senderWallet: tx.senderWallet,
    recipientWallet: tx.recipientWallet,
    createdAt: toIso(tx.createdAt),
    completedAt: tx.completedAt ? toIso(tx.completedAt) : null,
    failedAt: tx.failedAt ? toIso(tx.failedAt) : null,
    failedReason: tx.failedReason,
    completionAcknowledgedAt: tx.completionAcknowledgedAt ? toIso(tx.completionAcknowledgedAt) : null,
    needsAcknowledgement: tx.needsAcknowledgement,
  };
}

function toIso(value: Date): string {
  return value.toISOString();
}