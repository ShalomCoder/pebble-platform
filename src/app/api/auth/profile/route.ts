import { NextRequest } from "next/server";
import { ok, parseJsonBody } from "@/lib/api";
import { updateUserProfile } from "@/lib/auth/service";
import { requireFullName } from "@/lib/validate";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const body = await parseJsonBody(request);
    const fullName = requireFullName(body.fullName);
    const updated = await updateUserProfile(user.id, { fullName }, ctx);
    return ok({ fullName: updated.fullName });
  });
}
