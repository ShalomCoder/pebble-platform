"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/client/api";

export function SignOutOtherSessions({
  hasOtherSessions,
}: {
  hasOtherSessions: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<{ signedOut: number }>("/api/auth/sign-out-others", { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign out other sessions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onSignOut}
        disabled={busy || !hasOtherSessions}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
        Sign out other sessions
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
