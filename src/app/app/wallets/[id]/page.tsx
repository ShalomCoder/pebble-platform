import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownLeftIcon, ArrowDownRightIcon, ArrowUpRightIcon, SendIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { requireOwnedWallet } from "@/lib/wallets/service";
import { listTransactions } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money, formatDate } from "@/components/money";
import { CopyToClipboard } from "@/components/copy-button";
import { TransactionStatusBadge } from "@/components/transaction-status-badge";
import { clientTransaction } from "@/lib/serialize";
import { walletSurfaceCss, walletSurfaceIndex } from "@/components/wallet-card";
import { PebbleArc, PebbleBlob, PebbleDot } from "@/components/pebble-primitives";
import { cn } from "cn";

export const metadata = { title: "Wallet" };

export const dynamic = "force-dynamic";

export default async function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);
  const wallet = await requireOwnedWallet(db, account.id, id);
  if (!wallet) notFound();

  const history = await listTransactions(account.id, { walletId: wallet.id, page: 1, pageSize: 20 });
  const historyItems = history.items.map(clientTransaction);
  const surface = walletSurfaceCss(walletSurfaceIndex(wallet.id));
  const active = wallet.status === "ACTIVE";

  return (
    <div className="space-y-8">
      <Link href="/app/wallets" className="text-sm text-primary hover:underline">
        ← All wallets
      </Link>

      <section className={cn("relative overflow-hidden rounded-[1.75rem] pebble-shadow ring-1 ring-foreground/5", surface)}>
        <PebbleArc
          size={240}
          strokeWidth={26}
          sweep={150}
          rotation={220}
          className="pointer-events-none absolute -right-12 -top-16 text-foreground/10"
        />
        <PebbleBlob size={220} className="pointer-events-none absolute -bottom-24 -left-16 text-foreground/10" />
        <PebbleDot size={8} className="pointer-events-none absolute top-6 right-20 bg-foreground/15" />
        <PebbleDot size={5} className="pointer-events-none absolute top-4 right-32 bg-foreground/20" />

        <div className="relative flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium opacity-70">{wallet.name}</p>
              <p className="mt-1 font-mono text-xs tracking-tight opacity-60">{wallet.address}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide",
                active ? "bg-foreground/10" : "bg-foreground/5 opacity-60",
              )}
            >
              {wallet.currency}
            </span>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-widest opacity-50">Available balance</p>
            <Money
              amountMinor={wallet.balance}
              currency={wallet.currency}
              className="mt-1 block text-4xl leading-none font-semibold tracking-tight sm:text-5xl"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyToClipboard value={wallet.address} label="Copy address" />
            <Link href={`/app/send?from=${wallet.id}`} className={buttonVariants()}>
              <SendIcon />
              Send from this wallet
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-heading text-lg font-semibold tracking-tight">Wallet activity</h2>
        {historyItems.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No transactions on this wallet yet.{" "}
              <Link href="/app/send" className="text-primary underline-offset-3 hover:underline">
                Send money
              </Link>{" "}
              to get started.
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {historyItems.map((tx) => {
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
                            ? `To ${tx.recipientWallet.name}`
                            : `From ${tx.senderWallet.name}`}
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