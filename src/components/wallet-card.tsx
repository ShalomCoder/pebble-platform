import Link from "next/link";
import { cn } from "cn";
import type { SerializedWallet } from "@/lib/client/types";
import { Money } from "@/components/money";
import { CopyToClipboard } from "@/components/copy-button";
import { PebbleArc, PebbleDot } from "@/components/pebble-primitives";
import { TopUpDialog } from "@/components/top-up-dialog";

const SURFACES = [
  "bg-wallet-a text-wallet-a-foreground",
  "bg-wallet-b text-wallet-b-foreground",
  "bg-wallet-c text-wallet-c-foreground",
] as const;

export function walletSurfaceCss(index: number): string {
  return SURFACES[((index % SURFACES.length) + SURFACES.length) % SURFACES.length];
}

export function walletSurfaceIndex(id: string): number {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return sum % SURFACES.length;
}

export function WalletCard({
  wallet,
  index = 0,
  topUpEnabled = false,
}: {
  wallet: SerializedWallet;
  index?: number;
  topUpEnabled?: boolean;
}) {
  const surface = walletSurfaceCss(index);
  const active = wallet.status === "ACTIVE";

  return (
    <div className="group relative h-full">
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-2xl pebble-shadow ring-1 ring-foreground/5 transition-transform duration-200 group-hover:-translate-y-0.5",
          surface,
        )}
      >
        <PebbleArc
          size={180}
          strokeWidth={22}
          sweep={150}
          rotation={210}
          className="pointer-events-none absolute -right-12 -bottom-12 text-foreground/10"
        />
        <PebbleDot
          size={7}
          className="pointer-events-none absolute top-4 right-5 bg-foreground/15"
        />

        <Link href={`/app/wallets/${wallet.id}`} className="relative flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium opacity-80">{wallet.name}</p>
              <p className="mt-0.5 truncate font-mono text-[0.7rem] tracking-tight opacity-60">
                {wallet.address}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide">
              {wallet.currency}
            </span>
          </div>

          <div className="mt-auto">
            <Money
              amountMinor={wallet.balance}
              currency={wallet.currency}
              className="text-[1.7rem] leading-none font-semibold tracking-tight tabular-nums"
            />
          </div>
        </Link>

        <div className="relative flex items-center justify-between gap-3 border-t border-foreground/10 p-5 pt-4">
          <CopyToClipboard value={wallet.address} label="Copy address" />
          <span className="flex items-center gap-2">
            {topUpEnabled && <TopUpDialog wallet={wallet} trigger="ghost" />}
            <span
              className={cn(
                "size-2 rounded-full",
                active ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
              title={active ? "Active" : "Inactive"}
            />
          </span>
        </div>
      </div>
    </div>
  );
}