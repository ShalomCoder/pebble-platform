/**
 * Small server-side validation helpers. Hand-rolled and explicit rather than a
 * heavyweight schema library; every rule is deliberately bounded.
 */
import { AppError, ErrorCodes } from "./errors";

export function validationError(message: string): AppError {
  return new AppError(400, ErrorCodes.VALIDATION_ERROR, message);
}

export function requireString(
  value: unknown,
  field: string,
  opts?: { max?: number; min?: number; trim?: boolean },
): string {
  if (typeof value !== "string") {
    throw validationError(`"${field}" must be a string.`);
  }
  const v = opts?.trim === false ? value : value.trim();
  if (v.length === 0) {
    throw validationError(`"${field}" is required.`);
  }
  if (opts?.min !== undefined && v.length < opts.min) {
    throw validationError(`"${field}" must be at least ${opts.min} characters.`);
  }
  if (opts?.max !== undefined && v.length > opts.max) {
    throw validationError(`"${field}" must be at most ${opts.max} characters.`);
  }
  return v;
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, "email", { max: 254 }).toLowerCase();
  // Deliberately permissive; a real deployment would use a stricter validator.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError("Please enter a valid email address.");
  }
  return email;
}

export function requirePassword(value: unknown): string {
  const password = requireString(value, "password", { min: 8, max: 72 });
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw validationError("Password must contain at least one letter and one number.");
  }
  return password;
}

export function requireFullName(value: unknown): string {
  return requireString(value, "fullName", { min: 2, max: 80 });
}

export function requirePositiveMinor(value: unknown, field = "amountMinor"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, `"${field}" must be a positive whole number of minor units.`);
  }
  if (value > 1_000_000_000_000) {
    throw new AppError(422, ErrorCodes.VALIDATION_ERROR, `"${field}" exceeds the maximum allowed amount.`);
  }
  return value;
}