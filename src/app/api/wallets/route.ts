import { NextRequest } from "next/server";
import { created, ok, parseJsonBody } from "@/lib/api";
import { requireAccountForUser, assertSupportedCurrency } from "@/lib/accounts/service";
import { requireString } from "@/lib/validate";
import { createWallet, listWalletsForAccount, serializeWallet } from "@/lib/wallets/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";
import { AuditActions, writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (_request, user) => {
    const account = await requireAccountForUser(db, user.id);
    const wallets = await listWalletsForAccount(db, account.id);
    return ok({ wallets: wallets.map(serializeWallet) });
  });
}

export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const body = await parseJsonBody(request);
    const name = requireString(body.name, "name", { min: 1, max: 40 });
    const currency = assertSupportedCurrency(body.currency);

    const account = await requireAccountForUser(db, user.id);
    const wallet = await createWallet(db, {
      accountId: account.id,
      accountPublicCode: account.publicCode,
      name,
      currency,
    });

    await writeAudit(db, AuditActions.wallet_created, { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }, {
      resourceType: "wallet",
      resourceId: wallet.id,
      metadata: { address: wallet.address, currency: wallet.currency, name: wallet.name },
    });

    return created({ wallet: serializeWallet(wallet) });
  });
}