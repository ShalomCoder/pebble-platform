/**
 * Currency configuration. Money is always an integer count of minor units.
 */

export const CURRENCIES = {
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", minorPerMajor: 100 },
  USD: { code: "USD", name: "US Dollar", symbol: "$", minorPerMajor: 100 },
  EUR: { code: "EUR", name: "Euro", symbol: "€", minorPerMajor: 100 },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", minorPerMajor: 100 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    CURRENCY_CODES.includes(value as CurrencyCode)
  );
}

export function getCurrency(code: string) {
  return CURRENCIES[code as CurrencyCode];
}

/**
 * Formats an integer minor-unit amount as a locale string using the currency
 * symbol. Pure helper usable on both client and server.
 * Example: formatMoney(5000, "GHS") => "₵50.00"
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const cfg = getCurrency(currency);
  const symbol = cfg ? cfg.symbol : "";
  const major = Math.floor(Math.abs(amountMinor) / cfg.minorPerMajor);
  const minor = Math.abs(amountMinor) % cfg.minorPerMajor;
  const sign = amountMinor < 0 ? "-" : "";
  return `${sign}${symbol}${major}.${String(minor).padStart(2, "0")}`;
}

export type MoneyInput = string | number | null | undefined;

/**
 * Parses a user-supplied decimal amount ("50.25" or "50") into integer minor
 * units. Rejects invalid input. Never uses floating point arithmetic.
 */
export function parseAmountToMinor(input: MoneyInput): number | null {
  if (typeof input === "number" && Number.isInteger(input) && input > 0) {
    return input; // already in minor units
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [major, minor = ""] = trimmed.split(".");
  const majorInt = Number(major);
  if (!Number.isSafeInteger(majorInt)) return null;
  const minorInt = minor.length === 0 ? 0 : Number(minor.padEnd(2, "0"));
  const total = majorInt * 100 + minorInt;
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return total;
}

/** Formats an integer minor amount as raw decimals without a symbol: 5000 => "50.00" */
export function minorToDecimal(amountMinor: number): string {
  const major = Math.floor(Math.abs(amountMinor) / 100);
  const minor = Math.abs(amountMinor) % 100;
  const sign = amountMinor < 0 ? "-" : "";
  return `${sign}${major}.${String(minor).padStart(2, "0")}`;
}