import type { Pick } from "./types";

/**
 * Group wishes: when people join a Hunt together, each taps what would work for them.
 * Only a nameless summary leaves the server, so nobody sees whose wish was whose.
 */
export interface Wish {
  /** Most they'd like to spend: 1 = $, 2 = $$, 3 = $$$. Null = any. */
  price: 1 | 2 | 3 | null;
  /** How far: "walk" or "drive"; null = either. */
  reach: "walk" | "drive" | null;
  /** Up to three food words from the fixed shortcut list ("ramen", "tacos"). */
  crave: string[];
}

export interface WishSummary {
  /** How many people set wishes. */
  count: number;
  /** The lowest budget anyone set (so it works for everyone), or null. */
  price: 1 | 2 | 3 | null;
  /** "walk" if anyone wants to walk, else "drive" if anyone said drive, else null. */
  reach: "walk" | "drive" | null;
  /** The food words people tapped, most-wanted first (up to four). */
  crave: string[];
}

export const NO_WISHES: WishSummary = { count: 0, price: null, reach: null, crave: [] };

export function summarizeWishes(wishes: Wish[]): WishSummary {
  if (wishes.length === 0) return NO_WISHES;
  const prices = wishes.map((w) => w.price).filter((p): p is 1 | 2 | 3 => p != null);
  const counts = new Map<string, number>();
  for (const w of wishes) for (const c of new Set(w.crave)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return {
    count: wishes.length,
    price: prices.length > 0 ? (Math.min(...prices) as 1 | 2 | 3) : null,
    reach: wishes.some((w) => w.reach === "walk") ? "walk" : wishes.some((w) => w.reach === "drive") ? "drive" : null,
    crave: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c).slice(0, 4),
  };
}

const stem = (w: string) => w.toLowerCase().replace(/(es|s)$/, "");

/** Does a place suit the group's wishes? Unknown price or distance counts as fitting (never a guess against it). */
export function fitsWishes(p: Pick, s: WishSummary): boolean {
  if (s.count === 0) return false;
  if (s.price != null && p.priceLevel != null && p.priceLevel > s.price) return false;
  if (s.reach === "walk" && p.travelMode === "drive" && !p.travelUnknown) return false;
  if (s.crave.length === 0) return true;
  const text = `${p.name} ${p.suggestion} ${p.category ?? ""} ${(p.placeTypes ?? []).join(" ")}`.toLowerCase();
  return s.crave.some((c) => c.split(/\s+/).every((w) => text.includes(stem(w))));
}

/** "$$ or less · walking · ramen, tacos" for the party bar. */
export function wishLine(s: WishSummary): string {
  const parts = [
    s.price ? `${"$".repeat(s.price)} or less` : null,
    s.reach === "walk" ? "walking distance" : s.reach === "drive" ? "a short drive is fine" : null,
    s.crave.length > 0 ? s.crave.join(", ") : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
