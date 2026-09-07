import { NextRequest } from "next/server";
import { ok, parseJsonBody } from "@/lib/api";
import { createSession, maybePruneSessions, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { loginUser, serializeUser } from "@/lib/auth/service";
import { requireEmail } from "@/lib/validate";
import { requireString } from "@/lib/validate";
import { withPublicRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withPublicRoute(
    request,
    async (request, ctx) => {
      const body = await parseJsonBody(request);
      const email = requireEmail(body.email);
      const password = requireString(body.password, "password", { max: 72, trim: false });

      const user = await loginUser({ email, password }, ctx);
      const token = await createSession(user.id, {
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      });
      await maybePruneSessions();

      const res = ok({ user: serializeUser(user) });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    },
    { rateLimit: { key: "login", limit: 10, windowMs: 60_000 } },
  );
}