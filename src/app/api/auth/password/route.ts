import { NextRequest } from "next/server";
import { ok, parseJsonBody } from "@/lib/api";
import { changePassword } from "@/lib/auth/service";
import { getCurrentSessionId } from "@/lib/auth/session";
import { requireString } from "@/lib/validate";
import { requirePassword } from "@/lib/validate";
import { validationError } from "@/lib/validate";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAuthRoute(request, async (_request, user, ctx) => {
    const body = await parseJsonBody(request);
    const currentPassword = requireString(body.currentPassword, "currentPassword", { trim: false, min: 1, max: 72 });
    const newPassword = requirePassword(body.newPassword);
    const confirmPassword = requireString(body.confirmPassword, "confirmPassword", { trim: false, min: 1, max: 72 });

    if (newPassword !== confirmPassword) {
      throw validationError("New passwords do not match.");
    }

    const currentSessionId = await getCurrentSessionId();
    await changePassword(user.id, { currentPassword, newPassword }, ctx, { keepSessionId: currentSessionId });
    return ok({ updated: true });
  });
}
