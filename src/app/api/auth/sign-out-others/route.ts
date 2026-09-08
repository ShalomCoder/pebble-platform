import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { signOutOtherSessions } from "@/lib/auth/service";
import { getCurrentSessionId } from "@/lib/auth/session";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const currentSessionId = await getCurrentSessionId();
    const signedOut = await signOutOtherSessions(user.id, currentSessionId, ctx);
    return ok({ signedOut });
  });
}
