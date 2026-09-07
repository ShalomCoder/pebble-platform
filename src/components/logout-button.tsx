"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";

export function LogoutButton({
  className,
  variant = "ghost",
  size = "sm",
}: {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    if (loading) return;
    setLoading(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Logout should always succeed client-side even if the server errors.
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <Button variant={variant} size={size} onClick={onLogout} disabled={loading} className={className}>
      <LogOutIcon />
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}