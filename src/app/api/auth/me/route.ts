import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (_request, user) => {
    return ok({
      user: { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt },
    });
  });
}