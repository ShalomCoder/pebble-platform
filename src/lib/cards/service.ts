/**
 * Virtual demo cards.
 *
 * Cards are attached to a wallet and displayed as virtual/demo cards. Real
 * card numbers and CVVs are NEVER stored — only a last-four and a type.
 */
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomInt } from "node:crypto";
import { db } from "../db";
import { cards, wallets } from "../db/schema";
import type { CardRow, WalletRow } from "../db/schema";
import { type DbClient } from "../db/client";
import { AppError, ErrorCodes } from "../errors";
import { AuditActions, writeAudit, type AuditContext } from "../audit";

export const CARD_TYPES = ["VISA", "MASTERCARD", "VERVE"] as const;
export type CardType = (typeof CARD_TYPES)[number];

const walletOnCard = alias(wallets, "card_wallet");

function randomLastFour(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

function expiresAtDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  d.setMonth(11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}

export type CardWithWallet = {
  card: CardRow;
  wallet: WalletRow;
};

export function serializeCard(row: CardWithWallet) {
  return {
    id: row.card.id,
    walletId: row.card.walletId,
    walletName: row.wallet.name,
    walletAddress: row.wallet.address,
    lastFour: row.card.lastFour,
    cardType: row.card.cardType,
    status: row.card.status,
    createdAt: row.card.createdAt,
    expiresAt: row.card.expiresAt,
  };
}

/** Creates a virtual demo card on a wallet the caller owns. */
export async function createCard(
  client: DbClient,
  accountId: string,
  walletId: string,
  requestedType?: string,
  ctx: AuditContext = {},
): Promise<CardWithWallet> {
  const walletRows = await client
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.accountId, accountId)))
    .limit(1);
  const wallet = walletRows[0] ?? null;
  if (!wallet) {
    throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "Wallet not found.");
  }

  const cardType = requestedType && (CARD_TYPES as readonly string[]).includes(requestedType)
    ? requestedType
    : CARD_TYPES[randomInt(0, CARD_TYPES.length)];

  const [row] = await client
    .insert(cards)
    .values({ walletId, lastFour: randomLastFour(), cardType, expiresAt: expiresAtDate() })
    .returning();

  await writeAudit(client, AuditActions.card_created, ctx, {
    resourceType: "card",
    resourceId: row.id,
    metadata: { walletId, cardType, lastFour: row.lastFour },
  });

  return { card: row, wallet };
}

export async function listCardsForAccount(accountId: string): Promise<CardWithWallet[]> {
  return db_selectCards(accountId);
}

export async function requireOwnedCard(accountId: string, cardId: string): Promise<CardWithWallet | null> {
  const rows = await db_selectCards(accountId, cardId);
  return rows[0] ?? null;
}

async function db_selectCards(accountId: string, cardId?: string) {
  const conditions = [eq(walletOnCard.accountId, accountId)];
  if (cardId) conditions.push(eq(cards.id, cardId));
  return db
    .select({ card: cards, wallet: walletOnCard })
    .from(cards)
    .innerJoin(walletOnCard, eq(cards.walletId, walletOnCard.id))
    .where(and(...conditions))
    .orderBy(desc(cards.createdAt));
}

/** Deactivates a card belonging to the caller's account. */
export async function deactivateCardDB(
  accountId: string,
  cardId: string,
  ctx: AuditContext = {},
): Promise<CardWithWallet> {
  const row = await requireOwnedCard(accountId, cardId);
  if (!row) {
    throw new AppError(404, ErrorCodes.CARD_NOT_FOUND, "Card not found.");
  }
  if (row.card.status !== "ACTIVE") {
    return row; // idempotent
  }
  await db
    .update(cards)
    .set({ status: "INACTIVE" })
    .where(eq(cards.id, cardId));

  await writeAudit(db, AuditActions.card_deactivated, ctx, {
    resourceType: "card",
    resourceId: cardId,
    metadata: { walletId: row.wallet.id, lastFour: row.card.lastFour },
  });
  return { card: { ...row.card, status: "INACTIVE" }, wallet: row.wallet };
}