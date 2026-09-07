import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { deactivateCardDB, serializeCard } from "@/lib/cards/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

/** POST /api/cards/[id]/deactivate — deactivates one of the caller's virtual cards. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/cards/[id]/deactivate">) {
  return withAuthRoute(request, async (_request, user, auditCtx) => {
    const { id } = await ctx.params;
    const account = await requireAccountForUser(db, user.id);
    const row = await deactivateCardDB(account.id, id, {
      userId: user.id,
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent,
    });
    return ok({ card: serializeCard(row) });
  });
}