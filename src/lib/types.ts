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
  /** Shown again after every ring was searched: a place this person passed earlier. Device only. */
  secondLook?: boolean;
  distanceMeters: number;
  location: { lat: number; lng: number };
  address: string;
  payment: PaymentOptions | null;
  websiteUrl?: string;
  /** The restaurant's own ordering page, when Places has one. */
  orderUrl?: string;
  /** From Places: does takeout / delivery. null = unknown (we don't guess). */
  takeout?: boolean | null;
  delivery?: boolean | null;
  plate: PlateBalance;
  labels: HealthLabel[];
  /** 0–1, how balanced the dish style is. Drives "balanced first". */
  balance: number;
  /** At most one gentle tip, shown on the locked-in screen. */
  upgradeTip?: string;
  photo: PickPhoto;
  /** Google rating (1–5) and how many ratings, when Places has them. */
  rating?: number | null;
  ratingCount?: number | null;
  /** The place's Google Maps page, for the menu, photos and reviews. */
  mapsUrl?: string;
  /** Places data for the on-phone "does this fit me?" check in a party. */
  vegetarianOptions?: boolean | null;
  placeTypes?: string[];
}

export interface Dietary {
  /** e.g. "vegetarian", "vegan", "halal", "gluten-free" */
  diets: string[];
  /** e.g. "peanuts", "shellfish" */
  allergies: string[];
}

export type FeedMode = "walk" | "drive" | "demo";

/** How the server placed the search: the device's rounded point, typed words, or a city-level IP guess. */
export type AreaSource = "device" | "typed" | "ip" | "demo";
export type ThirdParty = "google" | "anthropic";

/** Lines of the NDJSON stream from /api/picks. */
export type PicksEvent =
  | {
      type: "meta";
      mode: FeedMode;
      sparse: boolean;
      /** The ring (see REACHES in lib/reach) these picks came from. Send it back with the next refill. */
      reach?: number;
      /** The typed words or the IP city, for the "What we sent" receipt. Null for a device point. */
      areaLabel: string | null;
      areaSource: AreaSource;
      /** Services this request's data was passed on to. */
      sharedWith: ThirdParty[];
      /** With a craving: whether places matching it were found (false = showing what's open instead). */
      cravingMatched?: boolean;
    }
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
  hostId: string | null;
  expiresAt: number;
  members: PartyMember[];
  /** Cards after the `since` the client asked for. */
  deck: PartyCard[];
  deckSize: number;
  /** How many cards each member has swiped, for "waiting on…" hints. */
  progress: Record<string, number>;
  /** The pick the group settled on (enough "go"s, or "Decide for us"), once there is one. */
  match: string | null;
  /**
   * Who said "I'm in" to each card, by member id. Empty until the reveal (a match): votes
   * are a secret ballot, so nobody's pick sways anyone else's.
   */
  likes: Record<string, string[]>;
  /** The cards this member said "I'm in" to (their own votes are never secret from them). */
  myVotes: string[];
  /** "Go"s a card needs to be a match: everyone in groups of up to 3, all but one in bigger groups. */
  needed: number;
  /** The one-time "+5 minutes" has been used. */
  extended: boolean;
  /** The latest group nudge ("Heartier"): the host's phone fetches matching cards from deck position `at`. */
  steer: PartySteer | null;
  /** Places removed because they don't fit someone (needs, or not enough time to get there). No who, no why. */
  unfit: string[];
}

export interface PartySteer {
  mood: Mood;
  seq: number;
  /** Deck size when the nudge was made; cards from here on follow it. */
  at: number;
  by: string;
}
