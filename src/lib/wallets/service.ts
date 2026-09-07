import { and, desc, eq } from "drizzle-orm";
import { wallets } from "../db/schema";
import type { WalletRow } from "../db/schema";
import { isUniqueViolation, type DbClient } from "../db/client";
import { AppError, ErrorCodes } from "../errors";
import { generateWalletAddress } from "../wallet/address";
import type { CurrencyCode } from "../currency";

const MAX_ADDRESS_GENERATION_ATTEMPTS = 8;

export type { WalletRow };

/** Inserts a wallet, regenerating the address on collision until unique. */
export async function createWallet(
  client: DbClient,
  input: {
    accountId: string;
    /** Account public code used to derive the wallet-address account fragment. */
    accountPublicCode: string;
    name: string;
    currency: CurrencyCode;
  },
): Promise<WalletRow> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ADDRESS_GENERATION_ATTEMPTS; attempt++) {
    const address = generateWalletAddress(input.accountPublicCode);
    try {
      const [row] = await client
        .insert(wallets)
        .values({
          accountId: input.accountId,
          address,
          name: input.name.trim(),
          currency: input.currency,
          balance: 0,
        })
        .returning();
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Address collision — regenerate and retry.
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  console.error("Could not generate a unique wallet address after retries", lastError);
  throw new AppError(500, ErrorCodes.INTERNAL, "Could not create the wallet. Please try again.");
}

export async function listWalletsForAccount(
  client: DbClient,
  accountId: string,
): Promise<WalletRow[]> {
  return client
    .select()
    .from(wallets)
    .where(and(eq(wallets.accountId, accountId), eq(wallets.status, "ACTIVE")))
    .orderBy(desc(wallets.createdAt));
}

/** Loads a wallet that must belong to the given account. Returns null otherwise. */
export async function getWalletForAccount(
  client: DbClient,
  accountId: string,
  walletId: string,
): Promise<WalletRow | null> {
  const rows = await client
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.accountId, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Like getWalletForAccount but throws instead of leaking whether the wallet exists. */
export async function requireOwnedWallet(
  client: DbClient,
  accountId: string,
  walletId: string,
): Promise<WalletRow> {
  const wallet = await getWalletForAccount(client, accountId, walletId);
  if (!wallet) {
    throw new AppError(404, ErrorCodes.WALLET_NOT_FOUND, "Wallet not found.");
  }
  return wallet;
}

export function serializeWallet(wallet: WalletRow) {
  return {
    id: wallet.id,
    address: wallet.address,
    name: wallet.name,
    currency: wallet.currency,
    balance: wallet.balance,
    status: wallet.status,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}