"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TransactionFilters({
  wallets,
}: {
  wallets: { id: string; name: string; currency: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const status = params.get("status") ?? "";
  const direction = params.get("direction") ?? "";
  const walletId = params.get("walletId") ?? "";

  function apply(patch: Record<string, string>) {
    const next = new URLSearchParams();
    const all = { search: search.trim(), status, direction, walletId, ...patch };
    Object.entries(all).forEach(([key, value]) => {
      if (value) next.set(key, value);
    });
    router.push(`/app/transactions${next.size > 0 ? `?${next.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 basis-40">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search memo or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply({ search: search.trim() });
          }}
        />
      </div>
      <Select value={status} onValueChange={(value) => apply({ status: value ?? "" })}>
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All statuses</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="PROCESSING">Processing</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={direction} onValueChange={(value) => apply({ direction: value ?? "" })}>
        <SelectTrigger>
          <SelectValue placeholder="Direction" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All directions</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="received">Received</SelectItem>
          <SelectItem value="self">Self</SelectItem>
        </SelectContent>
      </Select>
      <Select value={walletId} onValueChange={(value) => apply({ walletId: value ?? "" })}>
        <SelectTrigger>
          <SelectValue placeholder="Wallet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All wallets</SelectItem>
          {wallets.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="secondary"
        onClick={() => {
          setSearch("");
          apply({ search: "", status: "", direction: "", walletId: "" });
        }}
      >
        Reset
      </Button>
    </div>
  );
}