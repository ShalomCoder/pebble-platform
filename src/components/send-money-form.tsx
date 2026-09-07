"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/money";
import { PebbleOrbit } from "@/components/pebble-primitives";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedTransaction, SerializedWallet } from "@/lib/client/types";
import { parseAmountToMinor } from "@/lib/currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function generateReference(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const seg = (len: number) =>
    Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `PB-${seg(8)}-${seg(4)}`;
}

export function SendMoneyForm({
  wallets,
  initialFrom,
}: {
  wallets: SerializedWallet[];
  initialFrom?: string;
}) {
  const router = useRouter();
  const validInitial = wallets.some((w) => w.id === initialFrom) ? initialFrom : wallets[0]?.id ?? "";

  const [senderWalletId, setSenderWalletId] = useState(validInitial);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<SerializedTransaction | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const sender = wallets.find((w) => w.id === senderWalletId);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null) {
      setError("Enter a valid amount (e.g. 50.00).");
      return;
    }
    if (!/^\d{11}$/.test(recipientAddress.trim())) {
      setError("Enter an 11-digit Pebble wallet address.");
      return;
    }

    const reference = generateReference();
    setProcessing(true);
    try {
      const data = await apiFetch<{ transaction: SerializedTransaction }>("/api/transactions", {
        method: "POST",
        body: {
          reference,
          senderWalletId,
          recipientAddress: recipientAddress.trim(),
          amountMinor,
          memo: memo.trim() || undefined,
        },
      });
      setResult(data.transaction);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "INSUFFICIENT_FUNDS") {
          setError("Not enough balance in this wallet for that amount.");
        } else if (err.code === "ACTIVE_TRANSACTION_EXISTS" || err.code === "IDEMPOTENCY_CONFLICT") {
          setError("You already have a transfer in progress. Check the monitor to finish it.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. If your transfer started, the monitor will recover it.");
      }
    } finally {
      setProcessing(false);
    }
  }

  async function acknowledge() {
    if (!result) return;
    setAckError(null);
    try {
      await apiFetch<{ transaction: SerializedTransaction }>(
        `/api/transactions/${result.id}/acknowledge`,
        { method: "POST" },
      );
      router.refresh();
      setResult(null);
      setRecipientAddress("");
      setAmount("");
      setMemo("");
    } catch {
      setAckError("Could not acknowledge. It is safe to dismiss.");
    }
  }

  if (wallets.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Create a wallet before sending money.{" "}
          <Link href="/app/wallets" className="text-primary underline-offset-3 hover:underline">
            Go to wallets
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (result) {
    return (
      <Card className="overflow-hidden">
        <div className="relative flex flex-col items-center gap-4 px-6 pt-10 pb-6 text-center">
          <PebbleOrbit size={72} done />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Transfer completed</p>
            <p className="text-3xl font-semibold tracking-tight">
              <Money amountMinor={result.amount} currency={result.currency} />
            </p>
            <p className="text-sm text-muted-foreground">
              To {result.recipientWallet.name} · {result.recipientWallet.address}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{result.reference}</p>
          </div>
        </div>
        <CardFooter className="flex-col gap-2 pb-6">
          <Button onClick={acknowledge} className="w-full">
            Got it
          </Button>
          <Link href={`/app/transactions/${result.id}`} className="text-sm text-primary hover:underline">
            View transaction details
          </Link>
          {ackError && <p className="text-sm text-destructive">{ackError}</p>}
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label>From wallet</Label>
            <Select value={senderWalletId} onValueChange={(value) => setSenderWalletId(value ?? "")}>
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
            {sender && (
              <p className="text-xs text-muted-foreground">
                <Money amountMinor={sender.balance} currency={sender.currency} /> available
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipient-address">Recipient wallet address</Label>
            <Input
              id="recipient-address"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 84739162520"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              required
              maxLength={11}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Textarea
              id="memo"
              rows={2}
              maxLength={140}
              placeholder="What is this for?"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="pb-6">
          <Button type="submit" className="w-full" disabled={processing}>
            {processing ? <Loader2Icon className="animate-spin" /> : null}
            {processing ? "Sending…" : "Send money"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}