import { NextRequest } from "next/server";
import { ok, parseJsonBody } from "@/lib/api";
import { requirePositiveMinor } from "@/lib/validate";
import { requireString } from "@/lib/validate";
import { demoFundWallet } from "@/lib/demo";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

/**
 * POST /api/demo/fund  (DEV-ONLY)
 *
 * Adds demo funds to one of the caller's wallets so the prototype is usable
 * without an external source of funds. Disabled in production — the endpoint
 * returns 404 when PEBBLE_ENABLE_DEMO_FUNDING is not "true". This is a
 * prototype convenience and NOT part of the transfer engine.
 */
export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (request, user, ctx) => {
    const body = await parseJsonBody(request);
    const walletId = requireString(body.walletId, "walletId", { trim: false });
    const amountMinor = requirePositiveMinor(body.amountMinor);

    const result = await demoFundWallet(user.id, walletId, amountMinor, {
      userId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return ok({ funded: result });
  });
}