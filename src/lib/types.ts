export const MOODS = ["fresh", "comfort", "fast", "cheap", "treat"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  fresh: "Fresh",
  comfort: "Comfort",
  fast: "Fast",
  cheap: "Cheap",
  treat: "Treat",
};

/** Google Places price levels, collapsed to 1–4 ($ to $$$$). */
export type PriceLevel = 1 | 2 | 3 | 4;

/** Mirrors Google Places (New) `paymentOptions`. Missing = unknown. */
export interface PaymentOptions {
  acceptsCreditCards?: boolean;
  acceptsDebitCards?: boolean;
  acceptsCashOnly?: boolean;
  acceptsNfc?: boolean;
}

/** Estimated share of the plate, 0–1 each, summing to ~1. */
export interface PlateBalance {
  protein: number;
  veg: number;
  grain: number;
}

export type HealthLabel = "Protein" | "Veg" | "Whole grain";

export type PickPhoto =
  | { kind: "url"; url: string; attribution?: string }
  | { kind: "mock"; palette: [string, string, string]; motif: "bowl" | "plate" | "wrap" | "cup" };

export interface Pick {
  id: string;
  placeId: string;
  name: string;
  /** "Try a tofu poke bowl" */
  suggestion: string;
  /** "Fresh and filling." */
  reason: string;
  moods: Mood[];
  /** Coarse dish category ("noodles"), used on the device to turn skips into signals. */
  category: string | null;
  priceLevel: PriceLevel | null;
  /** ISO time the place closes today, or null if unknown. */
  closesAt: string | null;
  /** Minutes to get there by `travelMode`. Walking is the default; driving only when nothing is walkable. */
  walkMinutes: number;
  travelMode: "walk" | "drive";
  /** True when the time is a distance estimate rather than a Routes result. */
  timeEstimated?: boolean;
  /** Party cards on a device with no location: no travel time to show. */
  travelUnknown?: boolean;
  distanceMeters: number;
  location: { lat: number; lng: number };
  address: string;
  payment: PaymentOptions | null;
  websiteUrl?: string;
  /** The restaurant's own ordering page, when Places has one. */
  orderUrl?: string;
  plate: PlateBalance;
  labels: HealthLabel[];
  /** 0–1, how balanced the dish style is. Drives "balanced first". */
  balance: number;
  /** At most one gentle tip, shown on the locked-in screen. */
  upgradeTip?: string;
  photo: PickPhoto;
}

export interface Dietary {
  /** e.g. "vegetarian", "vegan", "halal", "gluten-free" */
  diets: string[];
  /** e.g. "peanuts", "shellfish" */
  allergies: string[];
}

export type FeedMode = "walk" | "drive" | "demo";

/** Lines of the NDJSON stream from /api/picks. */
export type PicksEvent =
  | { type: "meta"; mode: FeedMode; sparse: boolean; areaLabel: string | null }
  | { type: "pick"; pick: Pick }
  | { type: "need_location" }
  | { type: "empty"; message: string; suggestion: "drive" | "order_in" | "other_mood" }
  | { type: "error"; message: string }
  | { type: "done" };

/** A card in a party deck: restaurant data only. Travel times are left out (they'd hint at the host's location). */
export type PartyCard = Omit<Pick, "walkMinutes" | "distanceMeters" | "timeEstimated">;

export interface PartyMember {
  id: string;
  nickname: string;
}

/** What a member's poll returns. The room never holds location, prompts or cravings. */
export interface PartyState {
  code: string;
  hostId: string;
  expiresAt: number;
  members: PartyMember[];
  /** Cards after the `since` the client asked for. */
  deck: PartyCard[];
  deckSize: number;
  /** How many cards each member has swiped, for "waiting on…" hints. */
  progress: Record<string, number>;
  /** The pick everyone swiped right on, once there is one. */
  match: string | null;
}
