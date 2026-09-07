import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getTransactionForAccount } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/transactions/[id]">) {
  return withAuthRoute(request, async (_request, user) => {
    const { id } = await ctx.params;
    const account = await requireAccountForUser(db, user.id);
    const transaction = await getTransactionForAccount(account.id, id);
    if (!transaction) {
      // Do not reveal whether another user's transaction exists.
      throw new AppError(404, ErrorCodes.TRANSACTION_NOT_FOUND, "Transaction not found.");
    }
    return ok({ transaction });
  });
}