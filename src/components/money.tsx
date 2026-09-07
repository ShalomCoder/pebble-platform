import { cn } from "cn";
import { formatMoney } from "@/lib/currency";

type MoneyProps = {
  amountMinor: number;
  currency: string;
  sign?: "auto" | "always" | "none";
  className?: string;
};

/** Server-safe money formatter using integer minor units (no floating point). */
export function Money({ amountMinor, currency, sign = "auto", className }: MoneyProps) {
  let text = formatMoney(amountMinor, currency);
  if (sign === "always" && amountMinor >= 0) {
    text = `+${text}`;
  }
  if (sign === "none") {
    text = formatMoney(amountMinor, currency).replace(/^-/, "");
  }
  const direction = amountMinor < 0 ? "text-rose-600 dark:text-rose-400" : amountMinor > 0 ? "text-emerald-600 dark:text-emerald-400" : "";
  return <span className={cn("tabular-nums", sign === "auto" ? direction : "", className)}>{text}</span>;
}

export function formatAddress(address: string, className?: string) {
  return <span className={cn("font-mono tabular-nums", className)}>{address}</span>;
}

export function formatDate(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}