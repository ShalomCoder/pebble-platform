import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { requireAccountForUser } from "@/lib/accounts/service";
import { getTransactionForAccount } from "@/lib/transactions/service";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Money, formatDate } from "@/components/money";
import { CopyToClipboard } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { clientTransaction } from "@/lib/serialize";
import { PebbleArc } from "@/components/pebble-primitives";
import type { TransactionStatus } from "@/lib/client/types";
import { cn } from "cn";

export const metadata = { title: "Transaction" };

export const dynamic = "force-dynamic";

function StatusOrbit({ status }: { status: TransactionStatus }) {
  const settled = status === "COMPLETED";
  const failed = status === "FAILED" || status === "CANCELLED";
  const busy = !settled && !failed;
  const tone = failed ? "text-rose-400" : "text-pebble-dark";
  return (
    <div className={cn("relative size-24", tone)}>
      <PebbleArc size={96} strokeWidth={3} sweep={360} className="text-current" />
      {busy ? (
        <span className="absolute inset-0 animate-spin [animation-duration:2.5s]" aria-hidden>
          <span className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
        </span>
      ) : (
        <>
          <span aria-hidden className="absolute top-0 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
          <span aria-hidden className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-current opacity-50" />
        </>
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "size-3 rounded-full",
            failed ? "bg-rose-400/40" : "bg-pebble/30",
          )}
        />
      </span>
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let user;
  try {
    user = await requireAuth();
  } catch {
    redirect("/login");
  }
  const account = await requireAccountForUser(db, user.id);
  const txRow = await getTransactionForAccount(account.id, id);
  if (!txRow) notFound();
  const tx = clientTransaction(txRow);

  const sign = tx.direction === "sent" ? -1 : 1;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/app/transactions" className="text-sm text-primary hover:underline">
        ← All transactions
      </Link>

      <Card className="overflow-hidden">
        <div className="relative flex flex-col items-center gap-3 px-4 py-8 text-center">
          <PebbleArc size={200} strokeWidth={24} sweep={140} rotation={160} className="pointer-events-none absolute -top-10 -right-10 text-pebble-light" />
          <StatusOrbit status={tx.status} />
          <Money
            amountMinor={tx.amount * sign}
            currency={tx.currency}
            sign="always"
            className="text-4xl font-semibold tracking-tight"
          />
          <div className="text-sm text-muted-foreground">
            {tx.direction === "self"
              ? `${tx.senderWallet.name} to ${tx.recipientWallet.name}`
              : tx.direction === "sent"
                ? `Sent to ${tx.recipientWallet.accountName}`
                : `Received from ${tx.senderWallet.accountName}`}
          </div>
        </div>

        <CardContent className="space-y-4">
          {tx.memo && (
            <div className="rounded-lg bg-secondary/70 p-3 text-sm ring-1 ring-border/60">{tx.memo}</div>
          )}
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="font-mono">{tx.reference}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Amount</dt>
              <dd>
                <Money amountMinor={tx.amount} currency={tx.currency} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">{tx.status.toLowerCase()}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(tx.createdAt)}</dd>
            </div>
            {tx.completedAt && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Completed</dt>
                <dd>{formatDate(tx.completedAt)}</dd>
              </div>
            )}
            {tx.failedAt && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Failed</dt>
                <dd>{formatDate(tx.failedAt)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Sender</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2">
                {tx.senderWallet.accountName}
                <span className="font-mono text-xs text-muted-foreground">
                  {tx.senderWallet.name} · {tx.senderWallet.address}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Recipient</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2">
                {tx.recipientWallet.accountName}
                <span className="font-mono text-xs text-muted-foreground">
                  {tx.recipientWallet.name} · {tx.recipientWallet.address}
                </span>
              </dd>
            </div>
            {tx.needsAcknowledgement && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Acknowledgement</dt>
                <dd className="text-amber-600">Pending — use “Got it”</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        Re-send to recipient wallet:
        <CopyToClipboard value={tx.recipientWallet.address} label="Copy address" />
      </div>

      <div className="flex justify-center">
        <Link href="/app/send" className={buttonVariants({ variant: "outline" })}>
          Send money
        </Link>
      </div>
    </div>
  );
}