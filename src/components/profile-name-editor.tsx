"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PencilIcon, XIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/client/api";

export function ProfileNameEditor({
  initialName,
  className,
}: {
  initialName: string;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === initialName) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch<{ fullName: string }>("/api/auth/profile", {
        method: "PATCH",
        body: { fullName: trimmed },
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update your name.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <span className="font-medium">{initialName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          aria-label="Edit name"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Full name"
          autoFocus
          className="h-8 w-52"
        />
        <Button type="button" size="sm" onClick={save} disabled={saving} aria-label="Save name">
          {saving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setName(initialName);
            setEditing(false);
            setError(null);
          }}
          aria-label="Cancel"
        >
          <XIcon />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
