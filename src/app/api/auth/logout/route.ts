import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { deleteSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { AuditActions, writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      await deleteSession(token);
    }
    await writeAudit(db, AuditActions.logout, { userId: user.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });

    const res = ok({ loggedOut: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
  });
}