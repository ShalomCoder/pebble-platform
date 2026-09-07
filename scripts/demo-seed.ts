/**
 * Seed the database with demo data for preview.
 *
 * Usage: npm run db:migrate && npx tsx scripts/demo-seed.ts   (or after a reset)
 *
 * Creates three demo users, their accounts and wallets, a realistic history of
 * completed transfers (produced by the real transaction engine), and a few
 * cards. Everything is logged in as an audit trail via the same services the
 * app uses.
 *
 * Demo login credentials (password for all: Pebble123!):
 *   Anna  Adjei  anna@pebble.demo
 *   Kwame Mensah kwame@pebble.demo
 *   Yawa  Tetteh yawa@pebble.demo
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { transactions } from "../src/lib/db/schema";
import { wallets } from "../src/lib/db/schema";
import { registerUser } from "../src/lib/auth/service";
import { getAccountForUser } from "../src/lib/accounts/service";
import { createWallet } from "../src/lib/wallets/service";
import { createCard } from "../src/lib/cards/service";
import {
  createTransferIntent,
  executeTransferIntent,
  acknowledgeTransaction,
} from "../src/lib/transactions/service";

const PASSWORD = "Pebble123!";

async function seededUser(fullName: string, email: string) {
  const created = await registerUser({ fullName, email, password: PASSWORD }, {});
  const account = await getAccountForUser(db, created.user.id);
  if (!account) throw new Error(`missing account for ${email}`);
  return { user: created.user, account, main: created.wallet };
}

async function fund(walletId: string, amountMinor: number) {
  await db
    .update(wallets)
    .set({ balance: amountMinor })
    .where(eq(wallets.id, walletId));
}

async function transfer(
  accountId: string,
  senderWalletId: string,
  recipientAddress: string,
  amountMinor: number,
  memo: string,
) {
  const intent = await createTransferIntent(
    db,
    accountId,
    {
      reference: `PB-${Date.now().toString(36).toUpperCase()}-SEED`,
      senderWalletId,
      recipientAddress,
      amountMinor,
      memo,
    },
    {},
  );
  const tx = await executeTransferIntent(intent.transaction.reference, {});
  try {
    await acknowledgeTransaction(accountId, tx.id, {});
  } catch {
    // received-only transactions are not acknowledged; ignore
  }
  return tx;
}

async function backdate(txId: string, hoursAgo: number) {
  const at = new Date(Date.now() - hoursAgo * 3600 * 1000);
  const completed = new Date(at.getTime() + 4000);
  await db
    .update(transactions)
    .set({ createdAt: at, completedAt: completed })
    .where(eq(transactions.id, txId));
}

async function main() {
  console.log("Creating demo users…");
  const anna = await seededUser("Anna Adjei", "anna@pebble.demo");
  const kwame = await seededUser("Kwame Mensah", "kwame@pebble.demo");
  const yawa = await seededUser("Yawa Tetteh", "yawa@pebble.demo");

  const annaTravel = await createWallet(db, {
    accountId: anna.account.id,
    accountPublicCode: anna.account.publicCode,
    name: "Travel",
    currency: "USD",
  });
  const annaSavings = await createWallet(db, {
    accountId: anna.account.id,
    accountPublicCode: anna.account.publicCode,
    name: "Savings",
    currency: "USD",
  });
  const kwameUsd = await createWallet(db, {
    accountId: kwame.account.id,
    accountPublicCode: kwame.account.publicCode,
    name: "USD Wallet",
    currency: "USD",
  });
  const yawaEur = await createWallet(db, {
    accountId: yawa.account.id,
    accountPublicCode: yawa.account.publicCode,
    name: "Euro fund",
    currency: "EUR",
  });

  console.log("Funding wallets…");
  // "Deposits" (no ledger rows — stands in for external funding).
  await fund(anna.main.id, 7_545_00);
  await fund(annaTravel.id, 890_00);
  await fund(annaSavings.id, 300_00);
  await fund(kwame.main.id, 3_239_50);
  await fund(kwameUsd.id, 600_00);
  await fund(yawa.main.id, 1_815_50);
  await fund(yawaEur.id, 1_200_00);

  console.log("Building transfer history…");
  const history: { id: string; hoursAgo: number }[] = [];
  const record = async (hoursAgo: number, tx: { id: string }) => {
    history.push({ id: tx.id, hoursAgo });
    return backdate(tx.id, hoursAgo);
  };

  let tx = await transfer(anna.account.id, anna.main.id, kwame.main.address, 250_00, "Lunch split");
  await record(120, tx);
  tx = await transfer(anna.account.id, anna.main.id, yawa.main.address, 175_00, "Happy birthday!");
  await record(90, tx);
  tx = await transfer(kwame.account.id, kwame.main.id, anna.main.address, 320_00, "Rent share");
  await record(48, tx);
  tx = await transfer(yawa.account.id, yawa.main.id, kwame.main.address, 90_50, "Concert tickets");
  await record(30, tx);
  tx = await transfer(kwame.account.id, kwame.main.id, anna.main.address, 60_00, "Coffee run");
  await record(8, tx);
  tx = await transfer(anna.account.id, annaTravel.id, kwameUsd.address, 40_00, "Freelance invoice");
  await record(3, tx);

  // Same-account move: Anna rebalances Travel → Savings (USD → USD).
  const selfIntent = await createTransferIntent(
    db,
    anna.account.id,
    {
      reference: `PB-${Date.now().toString(36).toUpperCase()}-SELF`,
      senderWalletId: annaTravel.id,
      recipientAddress: annaSavings.address,
      amountMinor: 300_00,
      memo: "Reallocate savings",
    },
    {},
  );
  const selfTx = await executeTransferIntent(selfIntent.transaction.reference, {});
  await acknowledgeTransaction(anna.account.id, selfTx.id, {});
  await record(20, selfTx);

  console.log("Issuing demo cards…");
  const card1 = await createCard(db, anna.account.id, anna.main.id, "VISA", {});
  const card2 = await createCard(db, anna.account.id, annaTravel.id, "MASTERCARD", {});
  const card3 = await createCard(db, kwame.account.id, kwame.main.id, "VERVE", {});
  console.log("Cards issued:", [card1, card2, card3].map((c) => c.card.cardType).join(", "));

  const { rows } = await pool.query(
    "select (select count(*) from users) users, (select count(*) from accounts) accounts, (select count(*) from wallets) wallets, (select count(*) from transactions) transactions, (select count(*) from cards) cards",
  );
  console.log("Seed complete:", rows[0]);

  console.log("\nDemo logins (password: Pebble123!):");
  for (const u of [anna, kwame, yawa]) {
    console.log(`  ${u.user.email}  →  ${u.main.address}`);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});