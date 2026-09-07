import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { acknowledgeTransaction } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

/**
 * POST /api/transactions/[id]/acknowledge
 *
 * Explicit user acknowledgment of a completed transaction. Idempotent and
 * never alters financial status — it only records completion_acknowledged_at.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/transactions/[id]/acknowledge">) {
  return withAuthRoute(request, async (_request, user, auditCtx) => {
    const { id } = await ctx.params;
    const account = await requireAccountForUser(db, user.id);
    const transaction = await acknowledgeTransaction(account.id, id, {
      userId: user.id,
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent,
    });
    return ok({ transaction });
  });
}