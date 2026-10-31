import type { Pick } from "./types";

/**
 * A coarse dish category per pick ("noodles", "pizza"…), used only on the device to
 * turn repeated skips into gentle signals like "fewer noodles".
 */
const BY_TEXT: [RegExp, string][] = [
  [/ramen|pho|noodle|udon|soba|laksa/i, "noodles"],
  [/poke/i, "poke bowls"],
  [/sushi|sashimi/i, "sushi"],
  [/pizza|slice/i, "pizza"],
  [/burger/i, "burgers"],
  [/taco|burrito|quesadilla/i, "tacos"],
  [/salad/i, "salads"],
  [/curry|thali|dal|masala/i, "curry"],
  [/pasta|lasagna|risotto/i, "pasta"],
  [/sandwich|b[aá]nh m[iì]|wrap|sub\b/i, "sandwiches"],
  [/dumpling/i, "dumplings"],
  [/falafel|shawarma|mezze|souvlaki/i, "mezze"],
  [/steak|bbq|barbecue/i, "steak and BBQ"],
  [/gelato|ice cream|scoop|dessert|sweet|pastry|baked/i, "sweets"],
  [/grain bowl/i, "grain bowls"],
  [/bibimbap|rice bowl|bento/i, "rice bowls"],
];

const BY_TYPE: Record<string, string> = {
  ramen_restaurant: "noodles",
  vietnamese_restaurant: "noodles",
  pizza_restaurant: "pizza",
  hamburger_restaurant: "burgers",
  mexican_restaurant: "tacos",
  sushi_restaurant: "sushi",
  japanese_restaurant: "rice bowls",
  indian_restaurant: "curry",
  thai_restaurant: "curry",
  italian_restaurant: "pasta",
  sandwich_shop: "sandwiches",
  salad_shop: "salads",
  bakery: "sweets",
  ice_cream_shop: "sweets",
  dessert_shop: "sweets",
  cafe: "cafe bites",
  coffee_shop: "cafe bites",
  steak_house: "steak and BBQ",
  barbecue_restaurant: "steak and BBQ",
  fast_food_restaurant: "fast food",
};

export function dishCategory(suggestion: string, types: (string | null)[] = []): string | null {
  for (const [re, cat] of BY_TEXT) if (re.test(suggestion)) return cat;
  for (const t of types) if (t && BY_TYPE[t]) return BY_TYPE[t];
  return null;
}

const SIGNAL_AFTER = 2;

/**
 * Turns this session's skips into short hints for the ranker. Runs on the device;
 * only the resulting phrases (e.g. "fewer noodles", "shorter walks") are sent.
 */
export function skipSignals(skipped: Pick[]): string[] {
  const counts = new Map<string, number>();
  let far = 0;
  let pricey = 0;
  for (const p of skipped) {
    if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    if (p.walkMinutes >= 12) far++;
    if ((p.priceLevel ?? 0) >= 3) pricey++;
  }
  const signals = [...counts.entries()]
    .filter(([, n]) => n >= SIGNAL_AFTER)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => `fewer ${cat}`);
  if (far >= SIGNAL_AFTER) signals.push("shorter walks");
  if (pricey >= SIGNAL_AFTER) signals.push("cheaper places");
  return signals.slice(0, 6);
}

/** Moves picks that match a skip signal behind the others, keeping order otherwise. */
export function applySignals(picks: Pick[], signals: string[]): Pick[] {
  if (signals.length === 0) return picks;
  const avoid = (p: Pick) =>
    signals.some(
      (s) =>
        (p.category && s === `fewer ${p.category}`) ||
        (s === "shorter walks" && p.walkMinutes >= 12) ||
        (s === "cheaper places" && (p.priceLevel ?? 0) >= 3),
    );
  return [...picks.filter((p) => !avoid(p)), ...picks.filter(avoid)];
}

/** Picks that fit a mood first, keeping their order within each group. */
export function orderForMood(picks: Pick[], mood: Pick["moods"][number]): Pick[] {
  return [...picks.filter((p) => p.moods.includes(mood)), ...picks.filter((p) => !p.moods.includes(mood))];
}
