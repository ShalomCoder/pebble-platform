import { NextRequest } from "next/server";
import { created, ok, parseJsonBody } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { createCard, listCardsForAccount, serializeCard } from "@/lib/cards/service";
import { requireString } from "@/lib/validate";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (_request, user) => {
    const account = await requireAccountForUser(db, user.id);
    const cards = await listCardsForAccount(account.id);
    return ok({ cards: cards.map(serializeCard) });
  });
}

export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const body = await parseJsonBody(request);
    const walletId = requireString(body.walletId, "walletId", { trim: false });
    const cardType = typeof body.cardType === "string" ? body.cardType : undefined;

    const account = await requireAccountForUser(db, user.id);
    const row = await createCard(db, account.id, walletId, cardType, {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return created({ card: serializeCard(row) });
  });
}