import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Server-only database client.
 *
 * Uses a small singleton Pool so route handlers share connections.
 * The PostgreSQL connection URL comes from DATABASE_URL (see .env).
 */

export type Db = NodePgDatabase<typeof schema>;
export type TransactionDb = Parameters<Parameters<Db["transaction"]>[0]>[0];

function getPool(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env and set your Neon connection string.",
    );
  }
  return new Pool({
    connectionString: url,
    max: 5,
  });
}

type DbHandle = { pool: Pool; db: Db };

const globalForDb = globalThis as unknown as { __pebble?: DbHandle };

export function createDb(connectionString?: string): DbHandle {
  const pool = getPool(connectionString);
  return { pool, db: drizzle(pool, { schema }) as Db };
}

export function getDb(): DbHandle {
  if (!globalForDb.__pebble) {
    globalForDb.__pebble = createDb();
  }
  return globalForDb.__pebble;
}

export const db: Db = getDb().db;
export const pool: Pool = getDb().pool;
export { schema };