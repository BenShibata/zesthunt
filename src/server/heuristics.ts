import "server-only";
import type { HealthLabel, Mood, PlateBalance } from "@/lib/types";
import type { Place } from "./places";

/**
 * Rule-based description of a place from its Places type. Used when Claude is not
 * configured, fails, or is slower than the first-pick deadline. Like the LLM, it
 * only names a dish style the place type clearly supports and phrases it as "Try…".
 */
export interface Profile {
  suggestion: string;
  reason: string;
  moods: Mood[];
  plate: [number, number, number];
  labels: HealthLabel[];
  tip?: string;
}

const PROFILES: Record<string, Profile> = {
  poke_restaurant: { suggestion: "Try a poke bowl", reason: "Fresh and filling.", moods: ["fresh", "fast"], plate: [0.35, 0.4, 0.25], labels: ["Protein", "Veg"], tip: "Ask for half rice, half greens." },
  salad_shop: { suggestion: "Try a big loaded salad", reason: "Light, crunchy, keeps you going.", moods: ["fresh", "fast"], plate: [0.3, 0.5, 0.2], labels: ["Protein", "Veg"] },
  vegan_restaurant: { suggestion: "Try a veggie-packed plate", reason: "Bright and plant-forward.", moods: ["fresh"], plate: [0.25, 0.45, 0.3], labels: ["Veg", "Whole grain"] },
  vegetarian_restaurant: { suggestion: "Try a veggie-packed plate", reason: "Bright and plant-forward.", moods: ["fresh"], plate: [0.25, 0.45, 0.3], labels: ["Veg", "Whole grain"] },
  mediterranean_restaurant: { suggestion: "Try a mezze or grain plate", reason: "Fresh, herby, and hearty.", moods: ["fresh"], plate: [0.3, 0.4, 0.3], labels: ["Protein", "Veg"], tip: "Ask for extra salad on the side." },
  middle_eastern_restaurant: { suggestion: "Try a falafel or shawarma plate", reason: "Crunchy, fresh, and hearty.", moods: ["fresh", "cheap"], plate: [0.3, 0.35, 0.35], labels: ["Protein", "Veg"] },
  greek_restaurant: { suggestion: "Try a souvlaki plate with salad", reason: "Simple, fresh, satisfying.", moods: ["fresh"], plate: [0.35, 0.35, 0.3], labels: ["Protein", "Veg"] },
  vietnamese_restaurant: { suggestion: "Try pho or fresh rolls", reason: "Herby, light, and quick to land.", moods: ["fresh", "comfort"], plate: [0.3, 0.35, 0.35], labels: ["Protein", "Veg"], tip: "Ask for extra herbs and sprouts." },
  japanese_restaurant: { suggestion: "Try a rice bowl or bento", reason: "Clean flavors, nicely balanced.", moods: ["fresh"], plate: [0.35, 0.3, 0.35], labels: ["Protein"], tip: "Add a seaweed or cucumber salad." },
  sushi_restaurant: { suggestion: "Try a sushi set", reason: "Clean flavors, easy on the afternoon.", moods: ["fresh", "treat"], plate: [0.4, 0.2, 0.4], labels: ["Protein"], tip: "Add a seaweed salad on the side." },
  korean_restaurant: { suggestion: "Try a bibimbap", reason: "Comforting, colorful, and balanced.", moods: ["comfort", "fresh"], plate: [0.3, 0.4, 0.3], labels: ["Protein", "Veg"] },
  thai_restaurant: { suggestion: "Try a curry or stir-fry", reason: "Big flavor, plenty of veg.", moods: ["comfort"], plate: [0.3, 0.35, 0.35], labels: ["Protein", "Veg"], tip: "Ask for extra vegetables." },
  indian_restaurant: { suggestion: "Try a dal or curry with rice", reason: "Warm, spiced, and filling.", moods: ["comfort", "cheap"], plate: [0.3, 0.35, 0.35], labels: ["Protein", "Veg"] },
  ramen_restaurant: { suggestion: "Try a bowl of ramen", reason: "Rich broth for a slow meal.", moods: ["comfort"], plate: [0.3, 0.2, 0.5], labels: ["Protein"], tip: "Ask for extra greens in the bowl." },
  chinese_restaurant: { suggestion: "Try dumplings or a stir-fry", reason: "Hot, quick, and comforting.", moods: ["comfort", "cheap"], plate: [0.3, 0.3, 0.4], labels: ["Protein", "Veg"], tip: "Add a side of garlicky greens." },
  mexican_restaurant: { suggestion: "Try tacos or a burrito bowl", reason: "Fast, bright, and done in minutes.", moods: ["fast", "cheap"], plate: [0.35, 0.3, 0.35], labels: ["Protein", "Veg"], tip: "Ask for extra salsa and lettuce." },
  italian_restaurant: { suggestion: "Try a pasta dish", reason: "Warm and properly comforting.", moods: ["comfort", "treat"], plate: [0.25, 0.2, 0.55], labels: [], tip: "Add a side salad to share." },
  pizza_restaurant: { suggestion: "Try a veggie slice", reason: "Cheap, cheerful, and right there.", moods: ["cheap", "fast", "comfort"], plate: [0.2, 0.25, 0.55], labels: ["Veg"], tip: "Grab a side salad with it." },
  hamburger_restaurant: { suggestion: "Try a burger", reason: "A classic when you need comfort.", moods: ["comfort", "fast"], plate: [0.4, 0.15, 0.45], labels: ["Protein"], tip: "Swap fries for a side salad." },
  fast_food_restaurant: { suggestion: "Grab something quick here", reason: "In and out in minutes.", moods: ["fast", "cheap"], plate: [0.3, 0.15, 0.55], labels: [] },
  sandwich_shop: { suggestion: "Try a loaded sandwich", reason: "Eat it on the walk back.", moods: ["fast", "cheap"], plate: [0.3, 0.3, 0.4], labels: ["Protein"], tip: "Ask for whole grain bread." },
  breakfast_restaurant: { suggestion: "Try eggs and toast", reason: "A proper start to the day.", moods: ["comfort"], plate: [0.4, 0.2, 0.4], labels: ["Protein"], tip: "Add a side of fruit or greens." },
  brunch_restaurant: { suggestion: "Try an egg dish", reason: "Slow, cozy, and satisfying.", moods: ["comfort", "treat"], plate: [0.4, 0.2, 0.4], labels: ["Protein"] },
  cafe: { suggestion: "Try a light bite and a drink", reason: "Easy, quick, and close.", moods: ["fast", "cheap"], plate: [0.25, 0.2, 0.55], labels: [] },
  coffee_shop: { suggestion: "Try a light bite and a coffee", reason: "Easy, quick, and close.", moods: ["fast", "cheap"], plate: [0.25, 0.2, 0.55], labels: [] },
  bakery: { suggestion: "Try something fresh-baked", reason: "A small, happy pick-me-up.", moods: ["treat", "cheap"], plate: [0.15, 0.05, 0.8], labels: [] },
  ice_cream_shop: { suggestion: "Try a scoop", reason: "A small, happy finish.", moods: ["treat"], plate: [0.15, 0.05, 0.8], labels: [] },
  dessert_shop: { suggestion: "Try something sweet", reason: "A small, happy finish.", moods: ["treat"], plate: [0.15, 0.05, 0.8], labels: [] },
  steak_house: { suggestion: "Try a steak with greens", reason: "A proper sit-down treat.", moods: ["treat"], plate: [0.45, 0.2, 0.35], labels: ["Protein"], tip: "Ask to swap half the fries for greens." },
  seafood_restaurant: { suggestion: "Try a grilled fish plate", reason: "Light but satisfying.", moods: ["fresh", "treat"], plate: [0.4, 0.3, 0.3], labels: ["Protein", "Veg"] },
  barbecue_restaurant: { suggestion: "Try a BBQ plate", reason: "Smoky, hearty comfort.", moods: ["comfort", "treat"], plate: [0.45, 0.15, 0.4], labels: ["Protein"], tip: "Pick slaw or greens as a side." },
};

const GENERIC: Profile = {
  suggestion: "Try their most popular plate",
  reason: "Open now and close by.",
  moods: ["comfort"],
  plate: [0.3, 0.3, 0.4],
  labels: [],
};

export function profileFor(place: Place): Profile {
  if (place.primaryType && PROFILES[place.primaryType]) return PROFILES[place.primaryType];
  for (const t of place.types) if (PROFILES[t]) return PROFILES[t];
  return GENERIC;
}

export function balanceScore([protein, veg, grain]: [number, number, number]): number {
  return Math.max(0, 1 - (Math.abs(protein - 0.3) + Math.abs(veg - 0.4) + Math.abs(grain - 0.3)));
}

export function toPlate([protein, veg, grain]: [number, number, number]): PlateBalance {
  const sum = protein + veg + grain || 1;
  return { protein: protein / sum, veg: veg / sum, grain: grain / sum };
}
