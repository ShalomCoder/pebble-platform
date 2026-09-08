"use client";

import { useState } from "react";
import { Loader2Icon, LockKeyholeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/client/api";
import { PebbleOrbit } from "@/components/pebble-primitives";
import { cn } from "cn";

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "success">("idle");

  function reset() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setFieldErrors({});
    setFormError(null);
    setPhase("idle");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "saving") return;
    setFieldErrors({});
    setFormError(null);

    const errors: typeof fieldErrors = {};
    if (!current) errors.current = "Enter your current password.";
    if (!next) {
      errors.next = "Enter a new password.";
    } else if (next.length < 8) {
      errors.next = "Use at least 8 characters.";
    } else if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      errors.next = "Include at least one letter and one number.";
    }
    if (confirm !== next) errors.confirm = "New passwords do not match.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setPhase("saving");
    try {
      await apiFetch("/api/auth/password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next, confirmPassword: confirm },
      });
      setPhase("success");
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError) {
        if (err.code === "INVALID_CREDENTIALS") {
          setFieldErrors({ current: "Your current password is incorrect." });
        } else if (err.code === "VALIDATION_ERROR") {
          setFormError(err.message);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Could not update your password. Please try again.");
      }
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Password</p>
          <p className="text-xs text-muted-foreground">Last changed on sign-up.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <LockKeyholeIcon />
          Change password
        </Button>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <PebbleOrbit size={56} done />
        <div>
          <p className="text-sm font-semibold">Password updated</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your password has been changed successfully.
          </p>
        </div>
        <Button variant="outline" size="sm" className="mt-1" onClick={reset}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 py-1">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className={cn(fieldErrors.current && "aria-invalid:border-destructive")}
        />
        {fieldErrors.current && <p className="text-sm text-destructive">{fieldErrors.current}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        {fieldErrors.next && <p className="text-sm text-destructive">{fieldErrors.next}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {fieldErrors.confirm && <p className="text-sm text-destructive">{fieldErrors.confirm}</p>}
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={phase === "saving"}>
          {phase === "saving" ? <Loader2Icon className="animate-spin" /> : null}
          {phase === "saving" ? "Updating…" : "Update password"}
        </Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={phase === "saving"}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
