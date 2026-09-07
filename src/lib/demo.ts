/**
 * Demo funding (prototype feature).
 *
 * Lets demo users top up a wallet without an external source of funds. Not
 * part of the transaction engine. Enabled by default on every environment;
 * set PEBBLE_ENABLE_DEMO_FUNDING=false to disable it.
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { wallets } from "./db/schema";
import { AppError, ErrorCodes } from "./errors";
import { requireAccountForUser } from "./accounts/service";
import { requireOwnedWallet } from "./wallets/service";
import { AuditActions, writeAudit, type AuditContext } from "./audit";

export function demoFundingEnabled(): boolean {
  const value = process.env.PEBBLE_ENABLE_DEMO_FUNDING;
  if (value === undefined) return true;
  return value === "true";
}

const MAX_DEMO_DEPOSIT = 100_000_000_00; // 100,000 major units per deposit

/** Adds demo funds to one of the caller's wallets. Raises 404 when disabled. */
export async function demoFundWallet(
  userId: string,
  walletId: string,
  amountMinor: number,
  ctx: AuditContext = {},
): Promise<{ walletId: string; amountMinor: number; currency: string }> {
  if (!demoFundingEnabled()) {
    // Pretend the endpoint does not exist when disabled.
    throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "Not found.");
  }

  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, "Amount must be a positive whole number of minor units.");
  }
  if (amountMinor > MAX_DEMO_DEPOSIT) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, "Demo deposit amount is too large.");
  }

  const account = await requireAccountForUser(db, userId);
  const wallet = await requireOwnedWallet(db, account.id, walletId);

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + ${amountMinor}`, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    await writeAudit(tx, AuditActions.demo_funding, ctx, {
      resourceType: "wallet",
      resourceId: wallet.id,
      metadata: { amountMinor, currency: wallet.currency, walletAddress: wallet.address },
    });
  });

  return { walletId: wallet.id, amountMinor, currency: wallet.currency };
}