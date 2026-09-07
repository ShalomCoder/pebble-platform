import { NextRequest } from "next/server";
import { ok, parseJsonBody } from "@/lib/api";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { registerUser, serializeUser } from "@/lib/auth/service";
import { requireEmail, requireFullName, requirePassword } from "@/lib/validate";
import { withPublicRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withPublicRoute(
    request,
    async (request, ctx) => {
      const body = await parseJsonBody(request);
      const fullName = requireFullName(body.fullName);
      const email = requireEmail(body.email);
      const password = requirePassword(body.password);

      const { user, account, wallet } = await registerUser({ fullName, email, password }, ctx);
      const token = await createSession(user.id, {
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      });

      const res = ok(
        {
          user: serializeUser(user),
          account: { id: account.id, publicCode: account.publicCode, status: account.status },
          defaultWallet: {
            id: wallet.id,
            address: wallet.address,
            name: wallet.name,
            currency: wallet.currency,
            balance: wallet.balance,
          },
        },
        { status: 201 },
      );
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    },
    { rateLimit: { key: "register", limit: 10, windowMs: 60_000 } },
  );
}