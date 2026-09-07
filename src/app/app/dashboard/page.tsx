import Link from "next/link";
import { ArrowDownLeftIcon, ArrowDownRightIcon, ArrowUpRightIcon, PlusIcon, SendIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listWalletsForAccount } from "@/lib/wallets/service";
import { listTransactions } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { demoFundingEnabled } from "@/lib/demo";
import { clientTransaction, clientWallet } from "@/lib/serialize";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money, formatDate } from "@/components/money";
import { CopyToClipboard } from "@/components/copy-button";
import { TransactionStatusBadge } from "@/components/transaction-status-badge";
import { WalletCard } from "@/components/wallet-card";
import { PebbleArc, PebbleBlob, PebbleDot } from "@/components/pebble-primitives";
import { cn } from "cn";

export const metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuth();
  const account = await requireAccountForUser(db, user.id);
  const walletRows = await listWalletsForAccount(db, account.id);
  const recent = await listTransactions(account.id, { page: 1, pageSize: 6 });
  const wallets = walletRows.map(clientWallet);
  const recentItems = recent.items.map(clientTransaction);

  const totalsByCurrency = new Map<string, number>();
  for (const w of wallets) {
    totalsByCurrency.set(w.currency, (totalsByCurrency.get(w.currency) ?? 0) + w.balance);
  }
  const currencies = [...totalsByCurrency.entries()];
  const primary = currencies[0];
  const rest = currencies.slice(1);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Hello, {user.fullName.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is what is happening with your money.
          </p>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[1.75rem] bg-pebble-light/60 pebble-inset ring-1 ring-pebble-light">
        <PebbleArc
          size={300}
          strokeWidth={34}
          sweep={150}
          rotation={235}
          className="pointer-events-none absolute -right-14 -top-20 text-primary/10"
        />
        <PebbleBlob size={260} className="pointer-events-none absolute -bottom-32 -left-20 text-pebble/15" />
        <PebbleDot
          size={10}
          className="pointer-events-none absolute top-8 right-24 bg-pebble/30"
        />
        <PebbleDot
          size={5}
          className="pointer-events-none absolute top-5 right-36 bg-pebble/40"
        />

        <div className="relative flex flex-col gap-7 p-6 sm:p-9">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-pebble-dark/70">Total balance</p>
            {primary && (
              <div className="mt-2 flex items-baseline gap-2">
                <Money
                  amountMinor={primary[1]}
                  currency={primary[0]}
                  className="text-4xl leading-none font-semibold tracking-tight text-pebble-dark sm:text-5xl"
                />
                <span className="text-base font-medium text-pebble-dark/50">{primary[0]}</span>
              </div>
            )}
            {rest.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
                {rest.map(([currency, total]) => (
                  <div key={currency} className="flex items-baseline gap-1.5">
                    <Money
                      amountMinor={total}
                      currency={currency}
                      className="text-lg font-medium tabular-nums text-pebble-dark/90"
                    />
                    <span className="text-xs text-pebble-dark/50">{currency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-card/70 px-3 py-1.5 pebble-shadow ring-1 ring-pebble-light/40">
                <span className="text-xs text-muted-foreground">Code </span>
                <span className="font-mono text-sm font-medium tabular-nums">{account.publicCode}</span>
              </span>
              <CopyToClipboard value={account.publicCode} label="Copy" />
            </div>
            <div className="flex gap-2">
              <Link href="/app/wallets" className={buttonVariants({ variant: "outline" })}>
                <PlusIcon />
                Add wallet
              </Link>
              <Link href="/app/send" className={buttonVariants()}>
                <SendIcon />
                Send money
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Your wallets</h2>
          <Link href="/app/wallets" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {wallets.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No wallets yet.{" "}
              <Link href="/app/wallets" className="text-primary underline-offset-3 hover:underline">
                Create one
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w, i) => (
              <WalletCard key={w.id} wallet={w} index={i} topUpEnabled={demoFundingEnabled()} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Recent activity</h2>
          <Link href="/app/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recentItems.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No activity yet.
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {recentItems.map((tx) => {
                const outgoing = tx.direction === "sent";
                const self = tx.direction === "self";
                return (
                  <Link
                    key={tx.id}
                    href={`/app/transactions/${tx.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.04] sm:px-5"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        self
                          ? "bg-primary/10 text-primary"
                          : outgoing
                            ? "bg-rose-100 text-rose-500 dark:bg-rose-950/50"
                            : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50",
                      )}
                    >
                      {self ? (
                        <ArrowDownRightIcon className="size-4" />
                      ) : outgoing ? (
                        <ArrowUpRightIcon className="size-4" />
                      ) : (
                        <ArrowDownLeftIcon className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {self
                          ? `${tx.senderWallet.name} → ${tx.recipientWallet.name}`
                          : outgoing
                            ? `To ${tx.recipientWallet.accountName}`
                            : `From ${tx.senderWallet.accountName}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Money
                        amountMinor={outgoing ? -tx.amount : tx.amount}
                        currency={tx.currency}
                        className="text-sm font-medium"
                      />
                      <TransactionStatusBadge status={tx.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}