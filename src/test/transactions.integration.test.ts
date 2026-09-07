/**
 * Integration tests for the transaction engine's financial invariants.
 *
 * These run against a SEPARATE database defined by TEST_DATABASE_URL (see
 * .env). Without it, the whole suite is skipped — unit tests still run.
 *
 * The schema is migrated (not pushed) at the start of each run, so a clean
 * test database is expected. Every test starts from a truncated empty state.
 */
import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../lib/db";
import { wallets } from "../lib/db/schema";
import { registerUser, serializeUser } from "../lib/auth/service";
import { getAccountForUser } from "../lib/accounts/service";
import { createWallet } from "../lib/wallets/service";
import {
  createTransferIntent,
  executeTransferIntent,
  acknowledgeTransaction,
  getTransactionForAccount,
} from "../lib/transactions/service";

const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

const MAKE_USER_PASSWORD = "correct-horse-battery-staple";

async function makeUser(label: string, createExtraWallet = false, extraName = "Savings") {
  const email = `${label}-${randomUUID()}@pebble.test`;
  const created = await registerUser(
    { fullName: label, email, password: MAKE_USER_PASSWORD },
    {},
  );
  const account = await getAccountForUser(db, created.user.id);
  if (!account) throw new Error("account missing after registration");
  const extra = createExtraWallet
    ? await createWallet(db, {
        accountId: account.id,
        accountPublicCode: account.publicCode,
        name: extraName,
        currency: "GHS",
      })
    : null;
  return { user: serializeUser(created.user), account, wallet: created.wallet, extra };
}

async function fund(walletId: string, amountMinor: number) {
  await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} + ${amountMinor}` })
    .where(eq(wallets.id, walletId));
}

async function walletBalance(walletId: string): Promise<number> {
  const [row] = await db.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId));
  return row?.balance ?? -1;
}

function reference(): string {
  return `PB-${randomUUID().toString().replace(/-/g, "").slice(0, 8).toUpperCase()}-TEST`;
}

describe.skipIf(!hasTestDb).sequential("transaction engine (integration)", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    // Empty state for every test. users CASCADE wipes all dependent rows.
    await pool.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it("registration creates a user, account and default GHS wallet", async () => {
    const { user, account, wallet } = await makeUser("alice");
    expect(user.email).toMatch(/@pebble\.test$/);
    expect(account.publicCode).toMatch(/^\d{6}$/);
    expect(wallet.currency).toBe("GHS");
    expect(wallet.name).toBe("Main wallet");
    expect(wallet.balance).toBe(0);
    expect(wallet.address).toMatch(/^\d{11}$/);
  });

  it("a transfer debits the sender and credits the recipient exactly once", async () => {
    const sender = await makeUser("sender");
    const recipient = await makeUser("recipient");

    await fund(sender.wallet.id, 50_00);
    const beforeSender = await walletBalance(sender.wallet.id);
    const beforeRecipient = await walletBalance(recipient.wallet.id);

    const intent = await createTransferIntent(
      db,
      sender.account.id,
      {
        reference: reference(),
        senderWalletId: sender.wallet.id,
        recipientAddress: recipient.wallet.address,
        amountMinor: 15_50,
        memo: "lunch",
      },
      {},
    );
    expect(intent.mode).toBe("new");

    const tx = await executeTransferIntent(intent.transaction.reference, {});
    expect(tx.status).toBe("COMPLETED");
    expect(tx.amount).toBe(15_50);
    expect(tx.currency).toBe("GHS");
    expect(tx.direction).toBe("sent");
    expect(tx.needsAcknowledgement).toBe(true);

    expect(await walletBalance(sender.wallet.id)).toBe(beforeSender - 15_50);
    expect(await walletBalance(recipient.wallet.id)).toBe(beforeRecipient + 15_50);
  });

  it("an insufficient-funds transfer changes no balances and marks the intent FAILED", async () => {
    const sender = await makeUser("broke");
    const recipient = await makeUser("rich");

    await fund(sender.wallet.id, 10_00);
    const beforeSender = await walletBalance(sender.wallet.id);
    const beforeRecipient = await walletBalance(recipient.wallet.id);

    const ref = reference();
    await createTransferIntent(db, sender.account.id, {
      reference: ref,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 99_99,
    }, {});

    await expect(executeTransferIntent(ref, {})).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });

    // Balances untouched; the intent is a FAILED status marker only.
    expect(await walletBalance(sender.wallet.id)).toBe(beforeSender);
    expect(await walletBalance(recipient.wallet.id)).toBe(beforeRecipient);
  });

  it("reusing the same reference does not move money a second time (replay)", async () => {
    const sender = await makeUser("replayer");
    const recipient = await makeUser("replayer_target");
    await fund(sender.wallet.id, 50_00);

    const ref = reference();
    const input = {
      reference: ref,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 8_00,
    };

    const first = await createTransferIntent(db, sender.account.id, input, {});
    await executeTransferIntent(first.transaction.reference, {});

    const beforeSender = await walletBalance(sender.wallet.id);

    // Same reference + same parameters → replay, nothing moves again.
    const second = await createTransferIntent(db, sender.account.id, input, {});
    expect(second.mode).toBe("replay");
    expect(second.transaction.status).toBe("COMPLETED");

    expect(await walletBalance(sender.wallet.id)).toBe(beforeSender);
  });

  it("resuming an identical active intent returns it (resume)", async () => {
    const sender = await makeUser("resumer");
    const recipient = await makeUser("resumer_target");
    await fund(sender.wallet.id, 50_00);

    const ref = reference();
    const input = {
      reference: ref,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 4_00,
    };

    const first = await createTransferIntent(db, sender.account.id, input, {});
    expect(first.mode).toBe("new");

    // Same parameters while still active → resume.
    const resumed = await createTransferIntent(db, sender.account.id, input, {});
    expect(resumed.mode).toBe("resume");

    await executeTransferIntent(resumed.transaction.reference, {});
  });

  it("the same reference with different parameters is a conflict", async () => {
    const sender = await makeUser("conflict");
    const recipient = await makeUser("conflict_target");
    await fund(sender.wallet.id, 50_00);

    const ref = reference();
    await createTransferIntent(db, sender.account.id, {
      reference: ref,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 5_00,
    }, {});

    await expect(
      createTransferIntent(db, sender.account.id, {
        reference: ref,
        senderWalletId: sender.wallet.id,
        recipientAddress: recipient.wallet.address,
        amountMinor: 9_00,
      }, {}),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("permits only one active transaction per account", async () => {
    const sender = await makeUser("single");
    const recipient = await makeUser("single_target");
    await fund(sender.wallet.id, 50_00);

    const refA = reference();
    const refB = reference();
    await createTransferIntent(db, sender.account.id, {
      reference: refA,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 2_00,
    }, {});

    await expect(
      createTransferIntent(db, sender.account.id, {
        reference: refB,
        senderWalletId: sender.wallet.id,
        recipientAddress: recipient.wallet.address,
        amountMinor: 3_00,
      }, {}),
    ).rejects.toMatchObject({ code: "ACTIVE_TRANSACTION_EXISTS" });
  });

  it("rejects an unknown recipient address", async () => {
    // 00000000000 is a well-formed address (checksum "00" is valid) but no
    // wallet with that address exists — a genuine WALLET_NOT_FOUND.
    const sender = await makeUser("unknown");
    await expect(
      createTransferIntent(db, sender.account.id, {
        reference: reference(),
        senderWalletId: sender.wallet.id,
        recipientAddress: "00000000000",
        amountMinor: 1_00,
      }, {}),
    ).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("rejects an address with an invalid checksum", async () => {
    const sender = await makeUser("badsigs");
    await expect(
      createTransferIntent(db, sender.account.id, {
        reference: reference(),
        senderWalletId: sender.wallet.id,
        recipientAddress: "00000000999",
        amountMinor: 1_00,
      }, {}),
    ).rejects.toMatchObject({ code: "WALLET_ADDRESS_INVALID" });
  });

  it("rejects transferring to the same wallet", async () => {
    const sender = await makeUser("same");
    await expect(
      createTransferIntent(db, sender.account.id, {
        reference: reference(),
        senderWalletId: sender.wallet.id,
        recipientAddress: sender.wallet.address,
        amountMinor: 1_00,
      }, {}),
    ).rejects.toMatchObject({ code: "WALLET_SAME" });
  });

  it("self transfer between own wallets reports direction self", async () => {
    const user = await makeUser("selfer", true);
    await fund(user.wallet.id, 20_00);

    const intent = await createTransferIntent(db, user.account.id, {
      reference: reference(),
      senderWalletId: user.wallet.id,
      recipientAddress: user.extra!.address,
      amountMinor: 7_00,
    }, {});
    const tx = await executeTransferIntent(intent.transaction.reference, {});
    expect(tx.direction).toBe("self");
    expect(await walletBalance(user.wallet.id)).toBe(13_00);
    expect(await walletBalance(user.extra!.id)).toBe(7_00);
  });

  it("concurrent executions of the same intent move money exactly once", async () => {
    const sender = await makeUser("race");
    const recipient = await makeUser("race_target");
    await fund(sender.wallet.id, 30_00);

    const ref = reference();
    await createTransferIntent(db, sender.account.id, {
      reference: ref,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 10_00,
    }, {});

    const beforeSender = await walletBalance(sender.wallet.id);
    const results = await Promise.allSettled(
      [0, 1].map(() => executeTransferIntent(ref, {})),
    );

    for (const r of results) {
      if (r.status === "rejected") throw r.reason;
    }

    expect(await walletBalance(sender.wallet.id)).toBe(beforeSender - 10_00);
    expect(await walletBalance(recipient.wallet.id)).toBe(10_00);
  });

  it("acknowledgment is idempotent and restricted to completed transactions", async () => {
    const sender = await makeUser("acker");
    const recipient = await makeUser("acker_target");
    await fund(sender.wallet.id, 10_00);

    const intent = await createTransferIntent(db, sender.account.id, {
      reference: reference(),
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 2_00,
    }, {});
    const tx = await executeTransferIntent(intent.transaction.reference, {});

    const first = await acknowledgeTransaction(sender.account.id, tx.id, {});
    expect(first.completionAcknowledgedAt).not.toBeNull();
    expect(first.needsAcknowledgement).toBe(false);

    const second = await acknowledgeTransaction(sender.account.id, tx.id, {});
    expect(second.completionAcknowledgedAt).not.toBeNull();

    // A non-completed transaction cannot be acknowledged.
    const pendingRef = reference();
    const pendingIntent = await createTransferIntent(db, sender.account.id, {
      reference: pendingRef,
      senderWalletId: sender.wallet.id,
      recipientAddress: recipient.wallet.address,
      amountMinor: 1_00,
    }, {});
    await expect(
      acknowledgeTransaction(sender.account.id, pendingIntent.transaction.id, {}),
    ).rejects.toMatchObject({ code: "TRANSACTION_NOT_COMPLETED" });
  });

  it("prevents reading another account's transaction", async () => {
    const a = await makeUser("owner_a");
    const b = await makeUser("owner_b");
    await fund(a.wallet.id, 10_00);

    const intent = await createTransferIntent(db, a.account.id, {
      reference: reference(),
      senderWalletId: a.wallet.id,
      recipientAddress: b.wallet.address,
      amountMinor: 1_00,
    }, {});
    const tx = await executeTransferIntent(intent.transaction.reference, {});

    // Transaction belongs to account a and a's wallet is the sender.
    expect((await getTransactionForAccount(a.account.id, tx.id))?.id).toBe(tx.id);
    expect(await getTransactionForAccount(b.account.id, tx.id)).toBeNull();
  });

  it("rejects sending from a wallet that does not belong to the account", async () => {
    const attacker = await makeUser("attacker");
    const victim = await makeUser("victim");

    await expect(
      createTransferIntent(db, attacker.account.id, {
        reference: reference(),
        senderWalletId: victim.wallet.id,
        recipientAddress: attacker.wallet.address,
        amountMinor: 1_00,
      }, {}),
    ).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });
});