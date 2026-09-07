import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { requireOwnedWallet, serializeWallet } from "@/lib/wallets/service";
import { listTransactions } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";
import { serializeCard, listCardsForAccount } from "@/lib/cards/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/wallets/[id]">) {
  return withAuthRoute(request, async (_request, user) => {
    const { id } = await ctx.params;
    const account = await requireAccountForUser(db, user.id);
    const wallet = await requireOwnedWallet(db, account.id, id);

    const recent = await listTransactions(account.id, { walletId: wallet.id, page: 1, pageSize: 10 });
    const allCards = await listCardsForAccount(account.id);
    const walletCards = allCards.filter((c) => c.wallet.id === wallet.id);

    return ok({
      wallet: { ...serializeWallet(wallet), accountPublicCode: account.publicCode },
      transactions: recent.items,
      cards: walletCards.map(serializeCard),
    });
  });
}