/**
 * Transaction reference generation and validation.
 *
 * The reference is the idempotency key for a transfer. A reference is
 * generated only when the user explicitly starts a transaction (on submit),
 * never when a page merely loads. The same reference must be reused when
 * retrying the same logical operation.
 */
import { randomInt } from "node:crypto";

export const REFERENCE_PATTERN = /^PB-[0-9A-Z]{8}-[0-9A-Z]{4}$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

export function generateTransactionReference(): string {
  return `PB-${randomSegment(8)}-${randomSegment(4)}`;
}

export function validateReference(reference: unknown): boolean {
  return typeof reference === "string" && REFERENCE_PATTERN.test(reference);
}