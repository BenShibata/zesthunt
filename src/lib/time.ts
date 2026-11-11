import type { PriceLevel } from "./types";

export type MealFrame = "Breakfast" | "Lunch" | "Afternoon bite" | "Dinner" | "Late night";

/** Frames picks by the device clock. Shown as a label, never asked. */
export function mealFrame(now: Date): MealFrame {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 5 * 60) return "Late night";
  if (minutes < 10 * 60 + 30) return "Breakfast";
  if (minutes < 15 * 60) return "Lunch";
  if (minutes < 17 * 60) return "Afternoon bite";
  if (minutes < 22 * 60) return "Dinner";
  return "Late night";
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Minutes until closing, or null if unknown. */
export function minutesUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
}

export const CLOSING_SOON_MINUTES = 30;

/** "0.4 mi" where miles are the norm (US, UK, Liberia, Myanmar), "650 m" / "1.2 km" elsewhere. */
export function distanceText(meters: number, locale?: string): string {
  const region = (locale ?? (typeof navigator === "undefined" ? "en-US" : navigator.language)).split("-")[1]?.toUpperCase();
  if (["US", "GB", "LR", "MM"].includes(region ?? "")) {
    const mi = meters / 1609.34;
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function priceText(level: PriceLevel | null): { visual: string; spoken: string } {
  if (!level) return { visual: "Price not listed", spoken: "Price not listed" };
  const spoken = ["", "Inexpensive", "Moderately priced", "Pricey", "Very pricey"][level];
  return { visual: "$".repeat(level), spoken };
}

/** "4.6 (1.2k)" for the card, plus a spoken version. Null when Places has no rating. */
export function ratingText(rating: number | null | undefined, count: number | null | undefined): { visual: string; spoken: string } | null {
  if (rating == null || rating <= 0) return null;
  const n = count ?? 0;
  const short = n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
  const value = rating.toFixed(1);
  return {
    visual: n > 0 ? `${value} (${short})` : value,
    spoken: `Rated ${value} out of 5${n > 0 ? ` from ${n.toLocaleString("en-US")} ratings` : ""} on Google`,
  };
}

/** The size of the rounded area a location is snapped to, in the units the region uses. */
export function areaSizeText(locale?: string): string {
  const region = (locale ?? (typeof navigator === "undefined" ? "en-US" : navigator.language)).split("-")[1]?.toUpperCase();
  return ["US", "GB", "LR", "MM"].includes(region ?? "") ? "~½ mile" : "~1 km";
}
