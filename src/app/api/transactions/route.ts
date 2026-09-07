import { NextRequest } from "next/server";
import { created, ok, parseJsonBody } from "@/lib/api";
import { requireAccountForUser } from "@/lib/accounts/service";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requirePositiveMinor } from "@/lib/validate";
import { requireString } from "@/lib/validate";
import { validateReference } from "@/lib/reference";
import { createTransferIntent, executeTransferIntent, listTransactions } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { withAuthRoute } from "@/lib/route";

export const runtime = "nodejs";

/**
 * POST /api/transactions
 *
 * Body: { reference, senderWalletId, recipientAddress, amountMinor, memo? }
 *
 * The `reference` is the idempotency key. Reusing it with identical
 * parameters returns the existing transaction without moving money a second
 * time. Reusing it with different parameters is rejected.
 */
export async function POST(request: NextRequest) {
  return withAuthRoute(
    request,
    async (_request, user, ctx) => {
      const body = await parseJsonBody(request);
      const reference = requireString(body.reference, "reference", { trim: false });
      const senderWalletId = requireString(body.senderWalletId, "senderWalletId", { trim: false });
      const recipientAddress = requireString(body.recipientAddress, "recipientAddress", { trim: false });
      const amountMinor = requirePositiveMinor(body.amountMinor);
      const memo =
        body.memo === undefined || body.memo === null ? undefined : requireString(body.memo, "memo", { max: 140 });

      if (!validateReference(reference)) {
        throw new AppError(400, ErrorCodes.INVALID_REFERENCE, "Invalid transaction reference.");
      }

      const account = await requireAccountForUser(db, user.id);

      const intent = await createTransferIntent(
        db,
        account.id,
        { reference, senderWalletId, recipientAddress, amountMinor, memo },
        ctx,
      );

      // A "new" or "resume" intent must still be executed. "replay" already finished.
      const transaction =
        intent.mode === "new" || intent.mode === "resume"
          ? await executeTransferIntent(intent.transaction.reference, ctx)
          : intent.transaction;

      return created({ transaction });
    },
    { rateLimit: { key: "transfer", limit: 30, windowMs: 60_000 } },
  );
}

export async function GET(request: NextRequest) {
  return withAuthRoute(request, async (request, user) => {
    const account = await requireAccountForUser(db, user.id);
    const searchParams = request.nextUrl.searchParams;

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20);
    const status = searchParams.get("status") ?? undefined;
    const walletId = searchParams.get("walletId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    let direction: "sent" | "received" | "self" | undefined;
    const rawDirection = searchParams.get("direction");
    if (rawDirection === "sent" || rawDirection === "received" || rawDirection === "self") {
      direction = rawDirection;
    }

    const result = await listTransactions(account.id, { page, pageSize, status, walletId, direction, search });
    return ok(result);
  });
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}