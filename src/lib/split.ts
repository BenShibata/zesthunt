/**
 * Bill splitting, entirely on the device. Amounts never leave the phone except in
 * the message the user chooses to send from their own share sheet.
 */

/** Parses "84.50", "$84,50", "84" → cents. Returns null for anything unusable. */
export function parseAmountToCents(input: string): number | null {
  if (input.includes("-")) return null;
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // Treat a trailing ",dd" as decimals (e.g. "84,50"); other commas are thousands separators.
  const normalized = /,\d{1,2}$/.test(cleaned) && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return Math.round(value * 100);
}

/**
 * Splits cents into n shares that add up exactly to the total. When it doesn't
 * divide evenly, the first shares carry the extra cent.
 */
export function splitCents(totalCents: number, people: number): number[] {
  const n = Math.max(1, Math.floor(people));
  const base = Math.floor(totalCents / n);
  const extra = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export function splitMessage(place: string, totalCents: number, shares: number[]): string {
  const each = shares[0];
  const uneven = shares.some((s) => s !== each);
  const per = uneven ? `${formatMoney(shares[shares.length - 1])}–${formatMoney(each)} each` : `${formatMoney(each)} each`;
  return `${place}: ${formatMoney(totalCents)} split ${shares.length} ways is ${per}. Send it on Venmo, Cash App or Apple Cash. (Split on Zesthunt)`;
}
