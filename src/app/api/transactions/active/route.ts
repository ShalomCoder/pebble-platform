import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { getActiveTransaction } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

/**
 * GET /api/transactions/active
 * Returns the authenticated account's active transaction (PENDING/PROCESSING),
 * or null. Because Pebble allows only one active transaction per account,
 * recovery is unambiguous.
 */
export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (_request, user) => {
    const account = await requireAccountForUser(db, user.id);
    const transaction = await getActiveTransaction(account.id);
    return ok({ transaction });
  });
}