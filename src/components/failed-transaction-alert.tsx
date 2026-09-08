import Link from "next/link";
import { OctagonXIcon, AlertTriangleIcon } from "lucide-react";
import type { SerializedTransaction } from "@/lib/transactions/service";
import { clientTransaction } from "@/lib/serialize";
import { cn } from "cn";

export function FailedTransactionAlert({
  hasFailed,
  latest,
  className,
}: {
  hasFailed: boolean;
  latest?: SerializedTransaction;
  className?: string;
}) {
  if (!hasFailed) return null;
  const tx = latest ? clientTransaction(latest) : null;
  const recipientName = tx
    ? tx.direction === "received"
      ? tx.senderWallet.accountName
      : tx.recipientWallet.accountName
    : null;

  return (
    <div
      role="alert"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-rose-400/40 bg-rose-50/90 pebble-shadow",
        "dark:border-rose-500/40 dark:bg-rose-950/40",
        className,
      )}
    >
      <span aria-hidden className="absolute -right-8 -top-10 size-32 rounded-full bg-rose-400/15 blur-2xl" />
      <div className="relative flex items-start gap-3 p-4 sm:p-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
          <OctagonXIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            A recent transfer didn&apos;t go through
          </p>
          <p className="mt-1 text-sm text-rose-700/80 dark:text-rose-300/80">
            {recipientName ? (
              <>The last transfer{tx && <> to {recipientName}</>} failed. Your balance has not been charged.</>
            ) : (
              <>The most recent transfer was unsuccessful. Your balance has not been charged.</>
            )}
          </p>
          {tx && (
            <Link
              href={`/app/transactions/${tx.id}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              <AlertTriangleIcon className="size-4" aria-hidden />
              View failed transfer
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
