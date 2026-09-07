import { and, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { accounts } from "../db/schema";
import type { AccountRow } from "../db/schema";
import type { DbClient } from "../db/client";
import { AppError, ErrorCodes } from "../errors";
import { isCurrencyCode, CurrencyCode } from "../currency";

export type PublicAccount = {
  id: string;
  userId: string;
  publicCode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Derives a unique 6-digit opaque public code for an account. */
export async function generateAccountPublicCode(client: DbClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const existing = await client
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.publicCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new AppError(500, ErrorCodes.INTERNAL, "Could not allocate a unique account code.");
}

/** Loads the account for a user. Returns null when the user has no account. */
export async function getAccountForUser(
  client: DbClient,
  userId: string,
): Promise<AccountRow | null> {
  const rows = await client
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Loads an account that MUST belong to the given user. Throws when absent so
 * user-supplied identifiers can never reach another user's data.
 */
export async function requireAccountForUser(
  client: DbClient,
  userId: string,
): Promise<AccountRow> {
  const account = await getAccountForUser(client, userId);
  if (!account) {
    throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, "Account not found.");
  }
  return account;
}

export function assertSupportedCurrency(value: unknown): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, "Unsupported currency.");
  }
  return value;
}