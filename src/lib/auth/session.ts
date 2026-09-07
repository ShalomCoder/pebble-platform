/**
 * Server-side session management.
 *
 * An opaque random session token is stored in an HTTP-only cookie. The server
 * stores only a SHA-256 hash of the token. Sessions are never held client-side.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { count } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import { AppError, ErrorCodes } from "../errors";

export const SESSION_COOKIE = "pebble_session";

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  createdAt: Date;
};

function sessionTtlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
  return Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

function sessionTtlSeconds(): number {
  return Math.floor(sessionTtlMs() / 1000);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  };
}

export async function createSession(
  userId: string,
  context?: { ipAddress?: string; userAgent?: string },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + sessionTtlMs()),
    ipAddress: context?.ipAddress ?? null,
    userAgent: context?.userAgent ?? null,
  });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** Purges expired sessions (best-effort, called on login). */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}

/**
 * Resolves the authenticated user from the session cookie, or null.
 * The authenticated session is the source of identity — user IDs from the
 * browser are never trusted.
 */
async function resolveSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      createdAt: users.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.userId,
    fullName: row.fullName,
    email: row.email,
    createdAt: row.createdAt,
  };
}

/** React cache() ensures a single DB lookup per request across multiple calls. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return resolveSessionUser();
});

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError(401, ErrorCodes.AUTH_REQUIRED, "You must be signed in to continue.");
  }
  return user;
}

/** Prune expired sessions once in a while; safe to call from anywhere. */
export async function maybePruneSessions(): Promise<void> {
  const [row] = await db.select({ total: count() }).from(sessions);
  // Lightweight guard so we don't run DELETE on every request.
  if ((row?.total ?? 0) > 100) {
    await purgeExpiredSessions();
  }
}