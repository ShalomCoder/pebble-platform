/**
 * Pebble wallet address system.
 *
 * Addresses are numeric only, 11 digits total:
 *
 *   XXXXXXXXXCC
 *   |______|  |
 *    identity  checksum
 *
 *   fragment(3) | wallet component(6) | checksum(2)
 *   847          | 391625            | 17
 *
 * - The 3-digit account fragment is derived deterministically from the
 *   account's opaque public code (never from a sequential DB id).
 * - The 6-digit wallet component is generated with randomness.
 * - The 2-digit checksum is a weighted Mod-42 digest of the 9 identity digits.
 *
 * The checksum is for ERROR DETECTION and local STRUCTURAL VALIDATION only.
 * It is NOT a security mechanism and does not prove a wallet exists.
 * After local validation the server must still query the database to confirm
 * existence and authorization.
 */
import { randomInt } from "node:crypto";

export const WALLET_ADDRESS_LENGTH = 11;
export const ACCOUNT_FRAGMENT_LENGTH = 3;
export const WALLET_COMPONENT_LENGTH = 6;
export const CHECKSUM_LENGTH = 2;

/** Deterministic weight sequence for the 9 identity digits, left to right. */
const WEIGHTS = [7, 11, 3, 19, 5, 13, 17, 4, 2] as const;
const CHECKSUM_MOD = 42;
const ADDRESS_PATTERN = /^\d{11}$/;

/** FNV-1a 32-bit hash so the wallet-address account fragment is stable per public code. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Derives the 3-digit account fragment from an account's opaque public code.
 * Pure deterministic function; same code always yields the same fragment.
 */
export function accountFragmentFromPublicCode(publicCode: string): string {
  const normalized = String(publicCode).trim();
  return String(fnv1a(normalized) % 1000).padStart(ACCOUNT_FRAGMENT_LENGTH, "0");
}

/**
 * Computes the weighted Mod-42 checksum for the first 9 digits of an address.
 * Returns exactly two decimal digits (string), so 0..41.
 */
export function calculateWalletChecksum(identityDigits: string): string {
  if (identityDigits.length !== ACCOUNT_FRAGMENT_LENGTH + WALLET_COMPONENT_LENGTH) {
    throw new Error(
      `calculateWalletChecksum expects ${ACCOUNT_FRAGMENT_LENGTH + WALLET_COMPONENT_LENGTH} digits, received ${identityDigits.length}.`,
    );
  }
  if (!/^\d+$/.test(identityDigits)) {
    throw new Error("calculateWalletChecksum expects numeric digits only.");
  }
  let sum = 0;
  for (let i = 0; i < identityDigits.length; i++) {
    sum += Number(identityDigits[i]) * WEIGHTS[i];
  }
  return String(sum % CHECKSUM_MOD).padStart(CHECKSUM_LENGTH, "0");
}

function randomComponent(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String(randomInt(0, 10));
  }
  return out;
}

/**
 * Generates a new 11-digit Pebble wallet address for the given account public code.
 *
 * Uniqueness is NOT guaranteed here — callers must enforce the database unique
 * constraint and regenerate on collision.
 */
export function generateWalletAddress(accountPublicCode: string): string {
  const fragment = accountFragmentFromPublicCode(accountPublicCode);
  const walletComponent = randomComponent(WALLET_COMPONENT_LENGTH);
  const identity = fragment + walletComponent;
  return identity + calculateWalletChecksum(identity);
}

/**
 * Structural/checksum validation of a wallet address.
 *
 * Rejects malformed addresses BEFORE any database lookup. Does NOT prove the
 * wallet exists — the server must perform the existence/ownership lookup.
 */
export function validateWalletAddress(address: unknown): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length !== WALLET_ADDRESS_LENGTH) return false;
  if (!ADDRESS_PATTERN.test(trimmed)) return false;
  const identity = trimmed.slice(0, ACCOUNT_FRAGMENT_LENGTH + WALLET_COMPONENT_LENGTH);
  const checksum = trimmed.slice(ACCOUNT_FRAGMENT_LENGTH + WALLET_COMPONENT_LENGTH);
  return calculateWalletChecksum(identity) === checksum;
}