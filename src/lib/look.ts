import type { Pick } from "./types";

/**
 * Small visual cues that tell picks apart at a glance, before the photo arrives: a symbol
 * for the kind of food, and a color that's always the same for the same place.
 */
const BY_CATEGORY: Record<string, string> = {
  burgers: "🍔",
  "cafe bites": "☕",
  curry: "🍛",
  dumplings: "🥟",
  "fast food": "🍟",
  "grain bowls": "🥗",
  mezze: "🧆",
  noodles: "🍜",
  pasta: "🍝",
  pizza: "🍕",
  "poke bowls": "🐟",
  "rice bowls": "🍚",
  salads: "🥗",
  sandwiches: "🥪",
  "steak and BBQ": "🥩",
  sushi: "🍣",
  sweets: "🍰",
  tacos: "🌮",
};

/** Words in a place's type or name, for places without a known category. */
const BY_WORD: [RegExp, string][] = [
  [/hot ?dog/i, "🌭"],
  [/taco|mexican|burrito/i, "🌮"],
  [/ramen|noodle|pho|vietnamese/i, "🍜"],
  [/sushi|japanese/i, "🍣"],
  [/pizza|italian/i, "🍕"],
  [/burger|american|diner/i, "🍔"],
  [/chinese|dumpling/i, "🥟"],
  [/indian|curry|thai/i, "🍛"],
  [/korean|bbq|barbecue|steak/i, "🥩"],
  [/mediterranean|greek|middle eastern|falafel|lebanese/i, "🧆"],
  [/sandwich|deli|sub/i, "🥪"],
  [/salad|vegan|vegetarian|health/i, "🥗"],
  [/coffee|cafe|café|tea/i, "☕"],
  [/bakery|dessert|ice cream|donut|sweet|pastr/i, "🍰"],
  [/seafood|fish|poke/i, "🐟"],
  [/chicken|wings/i, "🍗"],
  [/breakfast|brunch|pancake/i, "🥞"],
  [/bar|pub|brewery/i, "🍺"],
];

export function foodSymbol(p: Pick): string {
  if (p.category && BY_CATEGORY[p.category]) return BY_CATEGORY[p.category];
  const text = `${p.kind ?? ""} ${(p.placeTypes ?? []).join(" ").replace(/_/g, " ")} ${p.name}`;
  for (const [re, symbol] of BY_WORD) if (re.test(text)) return symbol;
  return "🍽️";
}

/** A hue (0–359) that's always the same for the same place, so two places never look alike while loading. */
export function placeHue(p: Pick): number {
  let h = 0;
  for (const c of p.placeId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}
