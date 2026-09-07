import "dotenv/config";

// Integration tests run against a separate Neon database (TEST_DATABASE_URL),
// never the app database. Services read DATABASE_URL, so point it at the test
// DB before any db module is imported. Unit tests are unaffected.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Demo top-up is guarded by PEBBLE_ENABLE_DEMO_FUNDING !== "true"; enable it so
// tests can fund wallets without an external source of money.
process.env.PEBBLE_ENABLE_DEMO_FUNDING = "true";
process.env.SESSION_TTL_DAYS = "7";