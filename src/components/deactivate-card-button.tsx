"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedCard } from "@/lib/client/types";

export function DeactivateCardButton({ card }: { card: SerializedCard }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deactivate() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch<{ card: SerializedCard }>(`/api/cards/${card.id}`, { method: "PATCH" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not deactivate the card.");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={deactivate} disabled={loading}>
        {loading ? "Deactivating…" : "Deactivate"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}