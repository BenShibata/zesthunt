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

export function priceText(level: PriceLevel | null): { visual: string; spoken: string } {
  if (!level) return { visual: "Price not listed", spoken: "Price not listed" };
  const spoken = ["", "Inexpensive", "Moderately priced", "Pricey", "Very pricey"][level];
  return { visual: "$".repeat(level), spoken };
}
