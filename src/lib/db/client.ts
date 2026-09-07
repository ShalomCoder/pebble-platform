import * as schema from "./schema";
import type { Db, TransactionDb } from "./index";

export type Schema = typeof schema;
export type DbClient = Db | TransactionDb;
export { TransactionDb };

/** Returns true when the pg error is a unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}