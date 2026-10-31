/**
 * Stage 1 mock data. Fictional places around a fictional block so the UI can be
 * reviewed without any API keys. Stage 2 replaces this with Places + Routes + Claude.
 */
import { dishCategory } from "./categories";
import type { HealthLabel, Mood, Pick, PickPhoto, PaymentOptions, PlateBalance, PriceLevel } from "./types";

const ORIGIN = { lat: 37.7599, lng: -122.4148 };

interface Seed {
  name: string;
  suggestion: string;
  reason: string;
  moods: Mood[];
  price: PriceLevel | null;
  /** Minutes from now until closing; null = unknown. */
  closesIn: number | null;
  walk: number;
  payment: PaymentOptions | null;
  orderUrl?: string;
  /** Places says no takeout and no delivery. */
  dineInOnly?: boolean;
  plate: [number, number, number];
  labels: HealthLabel[];
  tip?: string;
  photo: PickPhoto;
}

const NFC_CARDS: PaymentOptions = { acceptsNfc: true, acceptsCreditCards: true, acceptsDebitCards: true };
const CARDS: PaymentOptions = { acceptsCreditCards: true, acceptsDebitCards: true, acceptsNfc: false };
const CASH: PaymentOptions = { acceptsCashOnly: true };

const SEEDS: Seed[] = [
  {
    name: "Kai Poke Bar",
    suggestion: "Try a tofu poke bowl",
    reason: "Fresh and filling.",
    moods: ["fresh", "fast"],
    price: 2,
    closesIn: 210,
    walk: 8,
    payment: NFC_CARDS,
    orderUrl: "https://example.com/kai-poke/order",
    plate: [0.35, 0.4, 0.25],
    labels: ["Protein", "Veg"],
    tip: "Ask for half rice, half greens.",
    photo: { kind: "mock", palette: ["#e8674a", "#3f8f6b", "#f2e6d0"], motif: "bowl" },
  },
  {
    name: "Verde Mesa",
    suggestion: "Try a grain bowl with roasted veg",
    reason: "Bright, warm, and keeps you going.",
    moods: ["fresh"],
    price: 2,
    closesIn: 140,
    walk: 6,
    payment: CARDS,
    plate: [0.25, 0.45, 0.3],
    labels: ["Veg", "Whole grain"],
    tip: "Add a soft egg for extra protein.",
    photo: { kind: "mock", palette: ["#5c8a3a", "#c97b3d", "#efe3c8"], motif: "bowl" },
  },
  {
    name: "Little Saigon Kitchen",
    suggestion: "Try fresh rolls and a light pho",
    reason: "Herby, light, and quick to land.",
    moods: ["fresh", "comfort"],
    price: 1,
    closesIn: 25,
    walk: 11,
    payment: CASH,
    plate: [0.25, 0.35, 0.4],
    labels: ["Protein", "Veg"],
    tip: "Ask for extra herbs and sprouts on the side.",
    photo: { kind: "mock", palette: ["#d9a066", "#4f7a4a", "#7a3b2a"], motif: "bowl" },
  },
  {
    name: "Olive & Lentil",
    suggestion: "Try a falafel plate with salad",
    reason: "Crunchy, fresh, and hearty.",
    moods: ["fresh", "cheap"],
    price: 1,
    closesIn: 300,
    walk: 5,
    payment: NFC_CARDS,
    plate: [0.25, 0.4, 0.35],
    labels: ["Protein", "Veg", "Whole grain"],
    tip: "Swap the fries for extra tabbouleh.",
    photo: { kind: "mock", palette: ["#b7792f", "#6b8e3d", "#f0dcb4"], motif: "plate" },
  },
  {
    name: "Seabird Sushi",
    suggestion: "Try a salmon and avocado set",
    reason: "Clean flavors, easy on the afternoon.",
    moods: ["fresh", "treat"],
    price: 3,
    closesIn: 180,
    walk: 12,
    payment: NFC_CARDS,
    orderUrl: "https://example.com/seabird/order",
    plate: [0.4, 0.25, 0.35],
    labels: ["Protein"],
    tip: "Add a seaweed salad on the side.",
    photo: { kind: "mock", palette: ["#e4734f", "#2f3a3a", "#f3efe6"], motif: "plate" },
  },
  {
    name: "Nonna Rosa",
    suggestion: "Try a bowl of baked pasta",
    reason: "Warm, cheesy, a proper hug.",
    moods: ["comfort", "treat"],
    price: 2,
    closesIn: 240,
    walk: 9,
    payment: CARDS,
    orderUrl: "https://example.com/nonna-rosa/order",
    plate: [0.25, 0.2, 0.55],
    labels: ["Protein"],
    tip: "Add a side salad to share.",
    photo: { kind: "mock", palette: ["#c2401f", "#e9b44c", "#5a2a1a"], motif: "plate" },
  },
  {
    name: "Rice & Ramen Co.",
    suggestion: "Try a miso ramen",
    reason: "Rich broth for a slow evening.",
    moods: ["comfort"],
    price: 2,
    closesIn: 330,
    walk: 7,
    payment: NFC_CARDS,
    plate: [0.3, 0.2, 0.5],
    labels: ["Protein"],
    tip: "Ask for extra greens in the bowl.",
    photo: { kind: "mock", palette: ["#d58b3a", "#3d2a1d", "#f3dfb8"], motif: "bowl" },
  },
  {
    name: "Mama Kim's",
    suggestion: "Try a bibimbap",
    reason: "Comforting, colorful, and balanced.",
    moods: ["comfort", "fresh"],
    price: 2,
    closesIn: 150,
    walk: 10,
    payment: CARDS,
    plate: [0.3, 0.4, 0.3],
    labels: ["Protein", "Veg"],
    photo: { kind: "mock", palette: ["#d2452c", "#3d7a46", "#f1d38a"], motif: "bowl" },
  },
  {
    name: "Dumpling Window",
    suggestion: "Try pork and chive dumplings",
    reason: "Hot, quick, and cheap.",
    moods: ["comfort", "fast", "cheap"],
    price: 1,
    closesIn: 95,
    walk: 4,
    payment: CASH,
    plate: [0.35, 0.15, 0.5],
    labels: ["Protein"],
    tip: "Add a side of garlicky greens.",
    photo: { kind: "mock", palette: ["#efe1c6", "#9a6a3a", "#3a2a1e"], motif: "plate" },
  },
  {
    name: "Taqueria Sol",
    suggestion: "Try two chicken tacos",
    reason: "Fast, bright, and done in minutes.",
    moods: ["fast", "cheap"],
    price: 1,
    closesIn: 420,
    walk: 3,
    payment: CASH,
    plate: [0.4, 0.3, 0.3],
    labels: ["Protein", "Veg"],
    tip: "Ask for extra pico and cabbage.",
    photo: { kind: "mock", palette: ["#e2a33d", "#c43a26", "#4a7a3a"], motif: "wrap" },
  },
  {
    name: "Wrapped",
    suggestion: "Try a chicken and hummus wrap",
    reason: "Eat it on the walk back.",
    moods: ["fast", "fresh"],
    price: 1,
    closesIn: 120,
    walk: 4,
    payment: NFC_CARDS,
    orderUrl: "https://example.com/wrapped/order",
    plate: [0.35, 0.35, 0.3],
    labels: ["Protein", "Veg", "Whole grain"],
    tip: "Ask for a whole wheat wrap.",
    photo: { kind: "mock", palette: ["#d9b37a", "#5d8a3c", "#8a4b2a"], motif: "wrap" },
  },
  {
    name: "Corner Bánh Mì",
    suggestion: "Try a lemongrass tofu bánh mì",
    reason: "Crunchy, zingy, and under ten minutes.",
    moods: ["fast", "cheap"],
    price: 1,
    closesIn: 60,
    walk: 6,
    payment: CASH,
    plate: [0.3, 0.3, 0.4],
    labels: ["Protein", "Veg"],
    photo: { kind: "mock", palette: ["#d89a4e", "#4f8a4f", "#f4e6c4"], motif: "wrap" },
  },
  {
    name: "Slice Society",
    suggestion: "Try a veggie slice",
    reason: "Cheap, cheerful, and right there.",
    moods: ["cheap", "fast", "comfort"],
    price: 1,
    closesIn: 480,
    walk: 2,
    payment: CARDS,
    plate: [0.2, 0.25, 0.55],
    labels: ["Veg"],
    tip: "Grab a side salad with it.",
    photo: { kind: "mock", palette: ["#d0412a", "#efc46a", "#6b8a3a"], motif: "plate" },
  },
  {
    name: "Curry Leaf",
    suggestion: "Try a chana masala thali",
    reason: "Big flavor, small price.",
    moods: ["cheap", "comfort"],
    price: 1,
    closesIn: 200,
    walk: 13,
    payment: null,
    plate: [0.3, 0.35, 0.35],
    labels: ["Protein", "Veg"],
    tip: "Ask for brown rice if they have it.",
    photo: { kind: "mock", palette: ["#d07a2a", "#8a2f1f", "#f1e2c2"], motif: "plate" },
  },
  {
    name: "Harvest Counter",
    suggestion: "Try a build-your-own salad",
    reason: "Load it up, keep it light.",
    moods: ["cheap", "fresh"],
    price: 1,
    closesIn: 45,
    walk: 7,
    payment: NFC_CARDS,
    orderUrl: "https://example.com/harvest/order",
    plate: [0.3, 0.5, 0.2],
    labels: ["Protein", "Veg", "Whole grain"],
    photo: { kind: "mock", palette: ["#4f8a3f", "#d9734a", "#efe6cf"], motif: "bowl" },
  },
  {
    name: "Ember Grill",
    dineInOnly: true,
    suggestion: "Try the steak frites",
    reason: "A proper sit-down treat.",
    moods: ["treat"],
    price: 3,
    closesIn: 270,
    walk: 14,
    payment: NFC_CARDS,
    plate: [0.45, 0.15, 0.4],
    labels: ["Protein"],
    tip: "Ask to swap half the fries for greens.",
    photo: { kind: "mock", palette: ["#6a2a1a", "#c4602a", "#e8d2a0"], motif: "plate" },
  },
  {
    name: "Gelato Lab",
    suggestion: "Try a pistachio cup",
    reason: "A small, happy finish.",
    moods: ["treat"],
    price: 2,
    closesIn: 160,
    walk: 5,
    payment: CARDS,
    plate: [0.15, 0.05, 0.8],
    labels: [],
    photo: { kind: "mock", palette: ["#8fae6a", "#f1e7d0", "#c86a4a"], motif: "cup" },
  },
  {
    name: "Bistro Marlo",
    suggestion: "Try the roast chicken plate",
    reason: "Cozy room, generous plate.",
    moods: ["treat", "comfort"],
    price: 3,
    closesIn: 230,
    walk: 10,
    payment: CARDS,
    plate: [0.4, 0.3, 0.3],
    labels: ["Protein", "Veg"],
    photo: { kind: "mock", palette: ["#b8642a", "#3f5a2a", "#f3dfb4"], motif: "plate" },
  },
];

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toPick(seed: Seed, i: number, now: Date): Pick {
  const [protein, veg, grain] = seed.plate;
  const plate: PlateBalance = { protein, veg, grain };
  // Balance: closer to an even-ish split with veg present scores higher.
  const balance = Math.max(0, 1 - (Math.abs(protein - 0.3) + Math.abs(veg - 0.4) + Math.abs(grain - 0.3)));
  const angle = (i * 137.5 * Math.PI) / 180;
  const meters = seed.walk * 80;
  return {
    id: `mock-${slug(seed.name)}`,
    placeId: `mock-${slug(seed.name)}`,
    name: seed.name,
    suggestion: seed.suggestion,
    reason: seed.reason,
    moods: seed.moods,
    category: dishCategory(seed.suggestion),
    priceLevel: seed.price,
    closesAt: seed.closesIn == null ? null : new Date(now.getTime() + seed.closesIn * 60000).toISOString(),
    walkMinutes: seed.walk,
    travelMode: "walk",
    distanceMeters: meters,
    location: {
      lat: ORIGIN.lat + (Math.cos(angle) * meters) / 111_000,
      lng: ORIGIN.lng + (Math.sin(angle) * meters) / 88_000,
    },
    address: `${100 + i * 37} Valencia St`,
    payment: seed.payment,
    orderUrl: seed.orderUrl,
    // Mock: places with an ordering page do takeout; the rest are unknown.
    takeout: seed.dineInOnly ? false : seed.orderUrl ? true : null,
    delivery: seed.dineInOnly ? false : null,
    plate,
    labels: seed.labels,
    balance,
    upgradeTip: seed.tip,
    photo: seed.photo,
  };
}

/**
 * Builds a queue for a mood. The first pick of a session leans balanced; after
 * that, mood fit leads and balance breaks ties.
 */
export function buildMockQueue(mood: Mood, now: Date, opts: { firstOfSession: boolean }): Pick[] {
  const all = SEEDS.map((s, i) => toPick(s, i, now));
  const inMood = all.filter((p) => p.moods.includes(mood));
  const ranked = [...inMood].sort((a, b) => {
    const moodRank = a.moods.indexOf(mood) - b.moods.indexOf(mood);
    if (mood === "fresh" || moodRank === 0) return b.balance - a.balance;
    return moodRank;
  });
  if (opts.firstOfSession && mood !== "fresh") {
    const best = ranked.reduce((top, p) => (p.balance > top.balance ? p : top), ranked[0]);
    return [best, ...ranked.filter((p) => p !== best)];
  }
  return ranked;
}
