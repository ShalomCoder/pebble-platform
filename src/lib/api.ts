/**
 * Server-side API helpers.
 *
 * Consistent response shape:
 *   success -> { data: <payload> }
 *   error   -> { error: { code, message } }
 */
import { NextResponse } from "next/server";
import { AppError, ErrorCodes, isAppError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function apiError(value: unknown): NextResponse {
  if (isAppError(value)) {
    return NextResponse.json(
      { error: { code: value.code, message: value.publicMessage } },
      { status: value.status },
    );
  }
  // Do not leak internals (stack traces / raw DB errors) to clients.
  console.error("[pebble] unexpected internal error", value);
  return NextResponse.json(
    { error: { code: ErrorCodes.INTERNAL, message: "Something went wrong on our end." } },
    { status: 500 },
  );
}

export async function parseJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, "Request body must be valid JSON.");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, "Request body must be an object.");
  }
  return raw as T;
}

/**
 * CSRF defense-in-depth. State-changing (non-GET) requests must carry an Origin
 * or Sec-Fetch-Site header consistent with the application's own origin. Paired
 * with SameSite=Lax cookies this blocks classic cross-site request forgery.
 */
export function assertNoCrossSiteRequest(request: Request): void {
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    const host = request.headers.get("host");
    const isSame = (cross: string) =>
      host === cross || `${host}:443` === cross || `${host}:80` === cross;
    const url = safeParseUrl(origin);
    if (!url || (url.host !== host && !isSame(url.host))) {
      throw new AppError(403, ErrorCodes.VALIDATION_ERROR, "Cross-site request rejected.");
    }
  } else if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    throw new AppError(403, ErrorCodes.VALIDATION_ERROR, "Cross-site request rejected.");
  } else if (process.env.NODE_ENV === "production") {
    // In production, all state-changing requests should carry an Origin.
    throw new AppError(403, ErrorCodes.VALIDATION_ERROR, "Request origin could not be verified.");
  }
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}