import type { Dietary, PartyCard } from "./types";

/**
 * Does a party card work for me? Runs on my phone only, against my own "What I eat".
 *
 * These are hints, never verdicts: nothing is removed because of them. Google says whether a
 * place serves vegetarian food; everything else is read from the place's name, type and the
 * dish, which can be wrong (a pizza place with gluten-free crust, a halal BBQ). So the person
 * sees a private note and decides; "Can't eat this" is their call, not ours.
 *
 * The only automatic removal is time, and only when it's certain: the place would close
 * before you could realistically get there.
 */

/** Minutes for the group to vote before anyone sets off. */
export const PARTY_VOTE_MINUTES = 10;
/** Arriving with less than this before closing is no real choice: the only automatic removal. */
export const MIN_MINUTES_THERE = 10;
/** Less than this once you're there gets a "closes soon after you'd get there" note. */
export const COMFORT_MINUTES = 30;

const has = (card: PartyCard, re: RegExp) => re.test(`${card.name} ${card.suggestion} ${card.category ?? ""} ${(card.placeTypes ?? []).join(" ")}`);

const MEATY = /\b(steaks?|bbq|barbecue|burgers?|hamburgers?|chicken wings?|wings|brisket|smokehouse|steak_house|barbecue_restaurant|hamburger_restaurant)\b/i;
const FISHY = /\b(sushi|sashimi|poke|seafood|oysters?|fish|sushi_restaurant|seafood_restaurant)\b/i;
const SHELLFISH = /\b(shrimps?|prawns?|crabs?|lobsters?|oysters?|seafood|seafood_restaurant)\b/i;
const PORK = /\b(pork|bacon|ham|bbq|barbecue|barbecue_restaurant|tonkotsu)\b/i;
const GLUTEN = /\b(pizzas?|pasta|bagels?|bakery|sandwich(es)?|pizza_restaurant|bagel_shop|sandwich_shop|donut_shop)\b/i;
const DAIRY = /\b(ice cream|gelato|ice_cream_shop|cheese|creamery|fondue)\b/i;
const PEANUT = /\b(peanut|satay|pad thai)\b/i;
/** A plant-based suggested dish ("Try a tofu poke bowl") means the place has something for you. */
const PLANT_DISH = /\b(tofu|tempeh|seitan|veggie|vegetables?|vegan|vegetarian|plant-based|falafel|chickpea|lentils?)\b/i;

/** Why a card might not fit me (a code; never sent anywhere). Null = nothing to flag. */
export function misfit(card: PartyCard, d: Dietary): string | null {
  const diets = d.diets;
  const noMeat = diets.some((x) => /veg|pesc/i.test(x));
  const noFish = diets.some((x) => /veg/i.test(x));
  if (noMeat && card.vegetarianOptions === false && !diets.includes("Pescatarian")) return "no vegetarian options";
  const plantDish = PLANT_DISH.test(card.suggestion);
  if (noMeat && card.vegetarianOptions !== true && !plantDish && has(card, MEATY)) return "meat-led";
  if (noFish && card.vegetarianOptions !== true && !plantDish && has(card, FISHY)) return "fish-led";
  if ((diets.includes("Halal") || diets.includes("Kosher")) && has(card, PORK)) return "pork-led";
  if (diets.includes("Kosher") && has(card, SHELLFISH)) return "shellfish";
  if (diets.includes("Gluten-free") && has(card, GLUTEN)) return "wheat-led";
  if (diets.includes("Dairy-free") && has(card, DAIRY)) return "dairy-led";
  if ((d.allergies.includes("Shellfish") && has(card, SHELLFISH)) || (d.allergies.includes("Fish") && has(card, FISHY))) return "allergy";
  if (d.allergies.includes("Peanuts") && has(card, PEANUT)) return "allergy";
  return null;
}

/** Minutes I'd have there before closing, after the vote and my own trip. Null when unknown. */
export function minutesThere(card: PartyCard, travelMinutes: number | null, now: Date): number | null {
  if (!card.closesAt || travelMinutes === null) return null;
  return Math.round((Date.parse(card.closesAt) - now.getTime()) / 60000 - PARTY_VOTE_MINUTES - travelMinutes);
}

/** Certain, not a guess: it would close before I could realistically get there. Unknown = keep. */
export function tooLate(card: PartyCard, travelMinutes: number | null, now: Date): boolean {
  const there = minutesThere(card, travelMinutes, now);
  return there !== null && there < MIN_MINUTES_THERE;
}

const REASON: Record<string, string> = {
  "no vegetarian options": "Google lists no vegetarian options here",
  "meat-led": "this looks meat-focused",
  "fish-led": "this looks fish or seafood-focused",
  "pork-led": "this may serve pork",
  shellfish: "this may serve shellfish",
  "wheat-led": "this looks wheat-heavy (bread, pizza or pasta)",
  "dairy-led": "this looks dairy-heavy",
  allergy: "this dish may include something you keep away from",
};

/**
 * The private note on a card, for me only: possible food mismatches, then a tight time window.
 * Phrased as "may" because it's a reading of names and types, not the menu.
 */
export interface FitNote {
  kind: "food" | "time";
  text: string;
}

export function fitNote(card: PartyCard, d: Dietary, travelMinutes: number | null, now: Date): FitNote | null {
  const why = misfit(card, d);
  if (why) return { kind: "food", text: `Heads up: ${REASON[why] ?? "this may not fit what you eat"}. It may still work for you. Only you see this.` };
  const there = minutesThere(card, travelMinutes, now);
  if (there !== null && there < COMFORT_MINUTES) return { kind: "time", text: `Heads up: it closes about ${Math.max(there, 0)} min after you'd get there.` };
  return null;
}
