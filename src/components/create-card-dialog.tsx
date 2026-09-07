"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedWallet } from "@/lib/client/types";

const CARD_TYPES = ["VISA", "MASTERCARD", "VERVE"] as const;

export function CreateCardDialog({ wallets }: { wallets: SerializedWallet[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [cardType, setCardType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!walletId) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/cards", {
        method: "POST",
        body: { walletId, cardType: cardType || undefined },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the card.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={wallets.length === 0} />}>
        <PlusIcon />
        New card
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create a virtual card</DialogTitle>
            <DialogDescription>
              Cards are linked to a wallet. Only the last four digits are stored.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={(value) => setWalletId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} — {w.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Card type</Label>
            <Select value={cardType} onValueChange={(value) => setCardType(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Random" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Random</SelectItem>
                {CARD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading || !walletId}>
              {loading ? <Loader2Icon className="animate-spin" /> : null}
              {loading ? "Creating…" : "Create card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm leading-none font-medium select-none">
      {children}
    </label>
  );
}