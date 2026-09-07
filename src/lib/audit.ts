/**
 * Audit logging.
 *
 * Audit logs record security-sensitive and financial actions. They are
 * append-only through these helpers and are NOT editable or deletable through
 * any user-facing API. Metadata is kept free of sensitive secrets.
 */
import { auditLogs } from "./db/schema";
import type { Db, TransactionDb } from "./db";

export const AuditActions = {
  registration: "registration",
  login_success: "login_success",
  login_failure: "login_failure",
  logout: "logout",
  session_invalidated: "session_invalidated",
  wallet_created: "wallet_created",
  transaction_created: "transaction_created",
  transaction_processing: "transaction_processing",
  transaction_completed: "transaction_completed",
  transaction_failure: "transaction_failure",
  completion_acknowledged: "completion_acknowledged",
  card_created: "card_created",
  card_deactivated: "card_deactivated",
  demo_funding: "demo_funding",
  account_updated: "account_updated",
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export type AuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditTarget = Db | TransactionDb;

export async function writeAudit(
  target: AuditTarget,
  action: AuditAction,
  ctx: AuditContext,
  opts?: {
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await target.insert(auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resourceType: opts?.resourceType,
    resourceId: opts?.resourceId,
    metadata: (opts?.metadata ?? null) as never,
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });
}

/** Context extracted from an incoming request (for route handler audit writes). */
export function auditContextFromRequest(request: Request): AuditContext {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  return {
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  };
}