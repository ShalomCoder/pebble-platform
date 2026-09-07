/**
 * Reset the public schema and apply all migrations via the app's own migrator.
 *
 * Usage: npx tsx scripts/db-migrate.ts
 *
 * Drops and recreates the public schema first, so the database is exactly the
 * state the migration files describe (with a __drizzle_migrations journal).
 * Used to repair a database that has stray/incomplete tables.
 */
import "dotenv/config";
import { db, pool } from "../src/lib/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  await pool.query('DROP SCHEMA IF EXISTS "public" CASCADE');
  await pool.query('CREATE SCHEMA "public"');

  // The drizzle migrator records applied migrations in its own `drizzle`
  // schema; it must be cleared too or completed migrations are skipped.
  await pool.query('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
  await pool.query('DROP TABLE IF EXISTS "__drizzle_migrations"');

  // Grant default privileges so the connected role (e.g. neondb_owner)
  // keeps full access on the recreated schema.
  await pool.query('GRANT ALL ON SCHEMA "public" TO PUBLIC');

  await migrate(db, { migrationsFolder: "./drizzle" });

  const { rows } = await pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log("Migrated tables:", (rows as { table_name: string }[]).map((r) => r.table_name).join(", "));
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});