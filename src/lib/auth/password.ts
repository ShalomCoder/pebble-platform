/**
 * Password hashing with Argon2id.
 *
 * Passwords are never stored in plaintext. Argon2id parameters use
 * OWASP-recommended defaults (via the argon2 package's defaults).
 */

import argon2 from "argon2";

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, HASH_OPTIONS);
}

export async function verifyPassword(
  plaintext: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plaintext);
  } catch {
    return false;
  }
}