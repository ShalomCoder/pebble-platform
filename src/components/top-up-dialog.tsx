"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Money } from "@/components/money";
import { PebbleOrbit } from "@/components/pebble-primitives";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedWallet } from "@/lib/client/types";
import { getCurrency, parseAmountToMinor } from "@/lib/currency";
import { cn } from "cn";

const QUICK_AMOUNTS = [50, 100, 250];

/** Wallet top-up. Rendered only when demo funding is enabled server-side. */
export function TopUpDialog({
  wallet,
  trigger = "ghost",
  triggerClassName,
}: {
  wallet: SerializedWallet;
  trigger?: "outline" | "ghost";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "submitting" | "success">("idle");
  const [addedMinor, setAddedMinor] = useState(0);
  const symbol = getCurrency(wallet.currency).symbol;

  function reset() {
    setOpen(false);
    setAmount("");
    setError(null);
    setPhase("idle");
    setAddedMinor(0);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "submitting") return;
    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setPhase("submitting");
    try {
      await apiFetch("/api/demo/fund", {
        method: "POST",
        body: { walletId: wallet.id, amountMinor },
      });
      setAddedMinor(amountMinor);
      setPhase("success");
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setError(err instanceof ApiError ? err.message : "Could not top up the wallet.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
      <DialogTrigger
        render={
          <Button variant={trigger} size="lg" type="button" className={cn(trigger === "outline" ? "bg-card/70" : undefined, triggerClassName)}>
            <PlusIcon />
            Top up
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md" showCloseButton={phase !== "success"}>
        {phase === "success" ? (
          <>
            <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
              <PebbleOrbit size={64} done />
              <div className="space-y-1">
                <DialogTitle>Top-up complete</DialogTitle>
                <DialogDescription>
                  <Money amountMinor={addedMinor} currency={wallet.currency} className="text-lg font-semibold text-foreground" />
                  {" added to "}
                  {wallet.name}
                </DialogDescription>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button className="w-full sm:w-auto">Done</Button>} />
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Top up {wallet.name}</DialogTitle>
              <DialogDescription>
                Current balance: <Money amountMinor={wallet.balance} currency={wallet.currency} />. Simulated deposit
                (demo mode).
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className={cn(
                    "h-8 rounded-lg border px-3 text-sm font-medium transition-colors",
                    amount === String(value)
                      ? "border-pebble bg-pebble-light text-pebble-dark"
                      : "border-border bg-card/60 text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {symbol}
                  {value}
                </button>
              ))}
            </div>

            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Top up amount"
              className="h-10 text-base"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
              <Button type="submit" disabled={phase === "submitting"}>
                {phase === "submitting" ? "Topping up…" : "Add funds"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}