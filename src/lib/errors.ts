/**
 * Application error type used across the server.
 *
 * `publicMessage` is safe to show to the user. Everything else (stack, cause)
 * must stay server-side so we never leak internals to clients.
 */

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_SESSION: "INVALID_SESSION",
  RATE_LIMITED: "RATE_LIMITED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  WALLET_ADDRESS_INVALID: "WALLET_ADDRESS_INVALID",
  WALLET_NOT_FOUND: "WALLET_NOT_FOUND",
  WALLET_UNAUTHORIZED: "WALLET_UNAUTHORIZED",
  WALLET_SAME: "WALLET_SAME",
  WALLET_INACTIVE: "WALLET_INACTIVE",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  ACTIVE_TRANSACTION_EXISTS: "ACTIVE_TRANSACTION_EXISTS",
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
  TRANSACTION_NOT_COMPLETED: "TRANSACTION_NOT_COMPLETED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  CARD_NOT_FOUND: "CARD_NOT_FOUND",
  CARD_UNAUTHORIZED: "CARD_UNAUTHORIZED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    publicMessage: string,
    details?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Business-rule failures that map to a bounded set of HTTP codes. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  if (value instanceof Error) {
    console.error("[pebble] unhandled error:", value);
  } else {
    console.error("[pebble] unhandled error value:", value);
  }
  return new AppError(
    500,
    ErrorCodes.INTERNAL,
    "Something went wrong on our end. Please try again.",
  );
}