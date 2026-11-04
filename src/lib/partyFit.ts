import type { Dietary, PartyCard } from "./types";

/**
 * Does a party card work for me? Runs on my phone only, against my own "What I eat", so the
 * room only ever hears "doesn't fit someone". Google Places says whether a place serves
 * vegetarian food; everything else is read from the place's type and the dish, so it removes
 * clear mismatches rather than guessing about every menu. "Can't eat this" covers the rest.
 */

/** Minutes to vote, plus a comfortable sit-down, on top of getting there. */
export const PARTY_VOTE_MINUTES = 10;
export const EAT_MINUTES = 30;

const has = (card: PartyCard, re: RegExp) => re.test(`${card.name} ${card.suggestion} ${card.category ?? ""} ${(card.placeTypes ?? []).join(" ")}`);

const MEATY = /\b(steaks?|bbq|barbecue|burgers?|hamburgers?|chicken wings?|wings|brisket|smokehouse|steak_house|barbecue_restaurant|hamburger_restaurant)\b/i;
const FISHY = /\b(sushi|sashimi|poke|seafood|oysters?|fish|sushi_restaurant|seafood_restaurant)\b/i;
const SHELLFISH = /\b(shrimps?|prawns?|crabs?|lobsters?|oysters?|seafood|seafood_restaurant)\b/i;
const PORK = /\b(pork|bacon|ham|bbq|barbecue|barbecue_restaurant|tonkotsu)\b/i;
const GLUTEN = /\b(pizzas?|pasta|bagels?|bakery|sandwich(es)?|pizza_restaurant|bagel_shop|sandwich_shop|donut_shop)\b/i;
const DAIRY = /\b(ice cream|gelato|ice_cream_shop|cheese|creamery|fondue)\b/i;
const PEANUT = /\b(peanut|satay|pad thai)\b/i;

/** Why a card doesn't fit (for tests and my own screen only; never sent). Null = fits. */
export function misfit(card: PartyCard, d: Dietary): string | null {
  const diets = d.diets;
  const noMeat = diets.some((x) => /veg|pesc/i.test(x));
  const noFish = diets.some((x) => /veg/i.test(x));
  if (noMeat && card.vegetarianOptions === false && !diets.includes("Pescatarian")) return "no vegetarian options";
  if (noMeat && card.vegetarianOptions !== true && has(card, MEATY)) return "meat-led";
  if (noFish && card.vegetarianOptions !== true && has(card, FISHY)) return "fish-led";
  if ((diets.includes("Halal") || diets.includes("Kosher")) && has(card, PORK)) return "pork-led";
  if (diets.includes("Kosher") && has(card, SHELLFISH)) return "shellfish";
  if (diets.includes("Gluten-free") && has(card, GLUTEN)) return "wheat-led";
  if (diets.includes("Dairy-free") && has(card, DAIRY)) return "dairy-led";
  if ((d.allergies.includes("Shellfish") && has(card, SHELLFISH)) || (d.allergies.includes("Fish") && has(card, FISHY))) return "allergy";
  if (d.allergies.includes("Peanuts") && has(card, PEANUT)) return "allergy";
  return null;
}

/**
 * Is there time? The place must still be open after the vote, the trip there (my own walk
 * or drive time) and a comfortable meal. Unknown hours or unknown travel = assume yes.
 */
export function tooLate(card: PartyCard, travelMinutes: number | null, now: Date): boolean {
  if (!card.closesAt || travelMinutes === null) return false;
  const left = (Date.parse(card.closesAt) - now.getTime()) / 60000;
  return left < PARTY_VOTE_MINUTES + travelMinutes + EAT_MINUTES;
}
