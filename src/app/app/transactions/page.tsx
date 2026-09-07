import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeftIcon, ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { listWalletsForAccount } from "@/lib/wallets/service";
import { listTransactions, type TransactionListFilters } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Money, formatDate } from "@/components/money";
import { TransactionStatusBadge } from "@/components/transaction-status-badge";
import { TransactionFilters } from "@/components/transaction-filters";
import { buttonVariants } from "@/components/ui/button";
import { clientTransaction, clientWallet } from "@/lib/serialize";
import { cn } from "cn";

export const metadata = { title: "Transactions" };

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 20;
  const filters: TransactionListFilters = {
    page,
    pageSize,
    status: sp.status === "COMPLETED" || sp.status === "PENDING" || sp.status === "PROCESSING" || sp.status === "FAILED" ? sp.status : undefined,
    direction: sp.direction === "sent" || sp.direction === "received" || sp.direction === "self" ? sp.direction : undefined,
    walletId: sp.walletId,
    search: sp.search,
  };

  const [walletRows, result] = await Promise.all([
    listWalletsForAccount(db, account.id),
    listTransactions(account.id, filters),
  ]);
  const wallets = walletRows.map(clientWallet);
  const items = result.items.map(clientTransaction);

  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total} transaction{result.total === 1 ? "" : "s"} in your account.
        </p>
      </div>

      <TransactionFilters wallets={wallets} />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No transactions match.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {items.map((tx) => {
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
                      {tx.memo ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {tx.memo}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(tx.createdAt)} · {tx.reference}
                    </p>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={`/app/transactions?${new URLSearchParams({ ...stripEmpty(sp), page: String(page - 1) })}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
            aria-disabled={page <= 1}
          >
            Previous
          </Link>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/app/transactions?${new URLSearchParams({ ...stripEmpty(sp), page: String(page + 1) })}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= totalPages && "pointer-events-none opacity-50")}
            aria-disabled={page >= totalPages}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}

function stripEmpty(
  sp: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(sp).filter(([, v]) => Boolean(v)));
}