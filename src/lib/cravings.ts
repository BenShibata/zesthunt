import type { MealFrame } from "./time";

/**
 * One-tap craving shortcuts in the craving field, by meal time. Each one runs a real
 * search for places serving it, so they're foods people search for, not moods.
 */
const BY_FRAME: Record<MealFrame, string[]> = {
  Breakfast: ["coffee", "bagels", "breakfast burrito", "pastries", "smoothie", "pancakes"],
  Lunch: ["tacos", "salad", "sandwich", "ramen", "pho", "sushi", "burrito"],
  "Afternoon bite": ["coffee", "boba", "pastries", "ice cream", "dumplings", "smoothie"],
  Dinner: ["pizza", "ramen", "sushi", "thai", "indian", "tacos", "burgers"],
  "Late night": ["pizza", "tacos", "burgers", "noodles", "fried chicken", "dessert"],
};

const MEATY = /\b(burgers|fried chicken)\b/;

/** Shortcuts for the meal; meat-led ones are left out for vegetarian and vegan diets. */
export function cravingShortcuts(frame: MealFrame, diets: string[] = []): string[] {
  const veg = diets.some((d) => /veg/i.test(d));
  return BY_FRAME[frame].filter((c) => !(veg && MEATY.test(c)));
}

/** Every shortcut word, for group wishes: a fixed list, so a room never holds typed text. */
export const ALL_CRAVINGS: readonly string[] = [...new Set(Object.values(BY_FRAME).flat())].sort();
