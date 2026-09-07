"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCwIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { PebbleOrbit, PebbleArc, PebbleDot } from "@/components/pebble-primitives";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedTransaction } from "@/lib/client/types";

export const TRANSFER_STARTED_EVENT = "pebble:transfer-started";
export const TRANSFER_FINISHED_EVENT = "pebble:transfer-finished";

const POLL_INTERVAL_MS = 3_000;

/**
 * Global transaction monitor.
 *
 * Pebble allows exactly one active transfer per account. After any page load
 * (or a crashed tab) this component polls the active transaction and offers
 * the user to finish it:
 *
 *  - PENDING/PROCESSING: shows the stuck transfer with a "Complete transfer"
 *    button. Resuming re-POSTs the SAME reference and parameters, so the
 *    server replays/resumes without ever moving money twice.
 *  - COMPLETED but unacknowledged: shows "Got it" which calls the
 *    acknowledge endpoint (never alters financial state).
 */
export function TransactionMonitor() {
  const router = useRouter();
  const [active, setActive] = useState<SerializedTransaction | null>(null);
  const [completed, setCompleted] = useState<SerializedTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const open = active !== null || completed !== null || busy;

  const poll = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const data = await apiFetch<{ transaction: SerializedTransaction | null }>("/api/transactions/active");
      setActive(data.transaction);
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_REQUIRED") {
        router.replace("/login");
      }
    }
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void poll(), 0);
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    const onStarted = () => {
      window.clearInterval(id);
      void poll();
    };
    window.addEventListener(TRANSFER_STARTED_EVENT, onStarted);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
      window.removeEventListener(TRANSFER_STARTED_EVENT, onStarted);
    };
  }, [poll]);

  async function resume() {
    if (!active || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const t = active;
      const result = await apiFetch<{ transaction: SerializedTransaction }>("/api/transactions", {
        method: "POST",
        body: {
          reference: t.reference,
          senderWalletId: t.senderWallet.id,
          recipientAddress: t.recipientWallet.address,
          amountMinor: t.amount,
          memo: t.memo ?? undefined,
        },
      });
      setActive(null);
      setCompleted(result.transaction);
      window.dispatchEvent(new CustomEvent(TRANSFER_FINISHED_EVENT));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete the transfer. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function acknowledge() {
    if (!completed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await apiFetch<{ transaction: SerializedTransaction }>(
        `/api/transactions/${completed.id}/acknowledge`,
        { method: "POST" },
      );
      setCompleted(null);
      setBusy(false);
      busyRef.current = false;
      router.refresh();
    } catch {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const shown = completed ?? active;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setActive(null); setCompleted(null); setError(null); } }}>
      <DialogContent
        position="bottom"
        showCloseButton={!busy}
        className="relative overflow-hidden rounded-3xl bg-primary/[0.035] pebble-shadow-lg"
      >
        <PebbleArc
          size={160}
          strokeWidth={22}
          sweep={130}
          rotation={200}
          className="pointer-events-none absolute -right-10 -bottom-12 text-pebble-light"
        />
        <PebbleDot
          size={6}
          className="pointer-events-none absolute top-3 right-8 bg-pebble-light"
        />
        <DialogHeader className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>
                {busy
                  ? "Finishing your transfer…"
                  : completed
                    ? "Transfer completed"
                    : active
                      ? "Transfer in progress"
                      : ""}
              </DialogTitle>
              <DialogDescription className="mt-1 text-base text-muted-foreground">
                {shown ? (
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xl font-semibold text-foreground">
                      <Money amountMinor={shown.amount} currency={shown.currency} />
                    </span>
                    <span className="truncate text-xs">
                      To {shown.recipientWallet.name} · {shown.recipientWallet.address}
                    </span>
                  </span>
                ) : null}
              </DialogDescription>
            </div>
            <PebbleOrbit
              size={44}
              processing={busy || !completed}
              done={!!completed}
              className="shrink-0 mt-1"
            />
          </div>
        </DialogHeader>

        {error && <p className="relative text-sm text-destructive">{error}</p>}

        {!busy && active && !completed && (
          <Button onClick={resume} className="relative w-full">
            <RotateCwIcon />
            Complete transfer
          </Button>
        )}
        {!busy && completed && (
          <Button onClick={acknowledge} className="relative w-full">
            Got it
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}