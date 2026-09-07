"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedWallet } from "@/lib/client/types";
import { minorToDecimal } from "@/lib/currency";

/** DEV-ONLY widget (hidden server-side when demo funding is disabled). */
export function DemoFunding({ wallets }: { wallets: SerializedWallet[] }) {
  const router = useRouter();
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [amount, setAmount] = useState("100.00");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fund() {
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/demo/fund", { method: "POST", body: { walletId, amountMinor } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not fund the wallet.");
    } finally {
      setLoading(false);
    }
  }

  if (wallets.length === 0 || !walletId) return null;

  return (
    <div className="rounded-2xl border border-dashed border-pebble/30 bg-pebble-light/30 p-4">
      <p className="mb-2 text-sm font-medium text-pebble-dark">Demo top-up</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={walletId} onValueChange={(value) => setWalletId(value ?? "")}>
          <SelectTrigger className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} ({minorToDecimal(w.balance)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="Amount"
          className="w-28"
        />
        <Button type="button" onClick={fund} disabled={loading}>
          {loading ? "Funding…" : "Add funds"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}