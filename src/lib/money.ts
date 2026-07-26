const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD";
// Fixed locale so server- and client-rendered amounts format identically.
const LOCALE = process.env.NEXT_PUBLIC_LOCALE || "en-AU";

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(cents / 100 + 0); // +0 normalises -0 to 0
}

/** Parses a user-entered amount like "3.50" into cents. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/[^0-9.]/g, "");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export const CURRENCY_CODE = CURRENCY;
