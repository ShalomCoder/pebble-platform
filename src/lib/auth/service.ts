import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { accounts, users } from "../db/schema";
import type { UserRow, AccountRow, WalletRow } from "../db/schema";
import { isUniqueViolation, type DbClient } from "../db/client";
import { AppError, ErrorCodes } from "../errors";
import { AuditActions, writeAudit, type AuditContext } from "../audit";
import { hashPassword, verifyPassword } from "./password";
import { generateAccountPublicCode } from "../accounts/service";
import { createWallet } from "../wallets/service";

export function serializeUser(user: UserRow) {
  return { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt };
}

/**
 * Registers a user, creating their account plus a default wallet atomically.
 * Runs inside a single DB transaction so an account never exists without its wallet.
 */
export async function registerUser(
  input: { fullName: string; email: string; password: string },
  ctx: AuditContext,
) {
  const email = input.email.toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new AppError(409, ErrorCodes.EMAIL_TAKEN, "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  let created: {
    user: UserRow;
    account: AccountRow;
    wallet: WalletRow;
  };

  try {
    created = await db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({ fullName: input.fullName.trim(), email, passwordHash })
        .returning();

      const publicCode = await generateAccountPublicCode(tx);
      const [accountRow] = await tx
        .insert(accounts)
        .values({ userId: userRow.id, publicCode })
        .returning();

      const walletRow = await createWallet(tx, {
        accountId: accountRow.id,
        accountPublicCode: publicCode,
        name: "Main wallet",
        currency: "GHS",
      });

      await writeAudit(
        tx,
        AuditActions.registration,
        { userId: userRow.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        {
          resourceType: "account",
          resourceId: accountRow.id,
          metadata: { email: userRow.email, accountPublicCode: publicCode, walletAddress: walletRow.address },
        },
      );

      return { user: userRow, account: accountRow, wallet: walletRow };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, ErrorCodes.EMAIL_TAKEN, "An account with this email already exists.");
    }
    throw error;
  }

  return { user: created.user, account: created.account, wallet: created.wallet };
}

// Dummy hash used to equalize timing between "email exists" and "email missing" logins.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("pebble-dummy-password-not-for-humans");
  }
  return dummyHashPromise;
}

/**
 * Authenticates a user with generic failure messaging. Login always uses the
 * same public error regardless of whether the email exists.
 */
export async function loginUser(input: { email: string; password: string }, ctx: AuditContext) {
  const email = input.email.toLowerCase();

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0] ?? null;

  const dummy = await dummyHash();
  const passwordOk = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyPassword(input.password, dummy);

  if (!user || !passwordOk) {
    await writeAudit(db, AuditActions.login_failure, {
      userId: user?.id ?? null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    // Generic message: does not reveal whether the email exists.
    throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, "Invalid email or password.");
  }

  await writeAudit(db, AuditActions.login_success, {
    userId: user.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return user;
}

export async function getAccountIdForUser(userId: string): Promise<string | null> {
  const row = await db
    .select({ accountId: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return row[0]?.accountId ?? null;
}

/** Internal: load account by user. Used by services that need it inside scripts. */
export async function loadAccountForUser(client: DbClient, userId: string) {
  const rows = await client
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}