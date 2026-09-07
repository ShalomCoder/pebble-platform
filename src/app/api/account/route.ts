import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";
import { serializeWallet } from "@/lib/wallets/service";
import { listWalletsForAccount } from "@/lib/wallets/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (_request, user) => {
    const account = await requireAccountForUser(db, user.id);
    const wallets = await listWalletsForAccount(db, account.id);
    return ok({
      account: { id: account.id, publicCode: account.publicCode, status: account.status },
      user: { id: user.id, fullName: user.fullName, email: user.email },
      wallets: wallets.map(serializeWallet),
    });
  });
}