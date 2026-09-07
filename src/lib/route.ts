import { NextRequest } from "next/server";
import { requireAuth, type SessionUser } from "./auth/session";
import { apiError, assertNoCrossSiteRequest } from "./api";
import { auditContextFromRequest, type AuditContext } from "./audit";
import { checkRateLimit } from "./rate-limit";
import { AppError, ErrorCodes } from "./errors";

type Handler = (
  request: NextRequest,
  user: SessionUser,
  ctx: AuditContext,
) => Promise<Response>;

const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wraps an authenticated Route Handler with:
 *  - uniform try/catch -> { error: { code, message } }
 *  - CSRF origin check for state-changing methods
 *  - optional per-route in-memory rate limiting
 */
export async function withAuthRoute(
  request: NextRequest,
  handler: Handler,
  opts?: { rateLimit?: { key: string; limit: number; windowMs: number } },
): Promise<Response> {
  try {
    if (CSRF_METHODS.has(request.method)) {
      assertNoCrossSiteRequest(request);
    }

    if (opts?.rateLimit) {
      const ip = clientIp(request);
      const { allowed, retryAfterSeconds } = checkRateLimit(
        `${ip}:${opts.rateLimit.key}`,
        opts.rateLimit.limit,
        opts.rateLimit.windowMs,
      );
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: {
              code: ErrorCodes.RATE_LIMITED,
              message: "Too many requests. Please try again shortly.",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) } },
        );
      }
    }

    const user = await requireAuth();
    const ctx = auditContextFromRequest(request);
    return await handler(request, user, ctx);
  } catch (error) {
    return apiError(error);
  }
}

/** Auth for unauthenticated endpoints (register/login), same wrapper minus requireAuth. */
export async function withPublicRoute(
  request: NextRequest,
  handler: (request: NextRequest, ctx: AuditContext) => Promise<Response>,
  opts?: { rateLimit?: { key: string; limit: number; windowMs: number } },
): Promise<Response> {
  try {
    if (CSRF_METHODS.has(request.method)) {
      assertNoCrossSiteRequest(request);
    }
    const ctx = auditContextFromRequest(request);

    if (opts?.rateLimit) {
      const ip = clientIp(request);
      const { allowed, retryAfterSeconds } = checkRateLimit(
        `${ip}:${opts.rateLimit.key}`,
        opts.rateLimit.limit,
        opts.rateLimit.windowMs,
      );
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: {
              code: ErrorCodes.RATE_LIMITED,
              message: "Too many requests. Please try again shortly.",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) } },
        );
      }
    }

    return await handler(request, ctx);
  } catch (error) {
    return apiError(error);
  }
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

export function requireMethod(request: NextRequest, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new AppError(405, ErrorCodes.VALIDATION_ERROR, "Method not allowed.");
  }
}