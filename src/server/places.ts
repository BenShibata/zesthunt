import "server-only";
import { env } from "./env";
import { areaKey, roundToArea, type LatLng } from "./geo";
import { TtlCache } from "./memory";
import type { PaymentOptions, PriceLevel } from "@/lib/types";

/** What we keep from a Places (New) result. Restaurant data only, nothing about the user. */
export interface Place {
  id: string;
  name: string;
  primaryType: string | null;
  types: string[];
  location: LatLng;
  address: string;
  priceLevel: PriceLevel | null;
  payment: PaymentOptions | null;
  websiteUri: string | null;
  openNow: boolean | null;
  nextCloseTime: string | null;
  /** The photo shown first: our best guess at the food (see `foodFirst`). */
  photoName: string | null;
  /** The photographer's name, shown with the photo as Google requires. */
  photoAuthor: string | null;
  summary: string | null;
  servesVegetarianFood: boolean | null;
  takeout: boolean | null;
  delivery: boolean | null;
  /** Google rating, 1–5, and how many ratings it's based on. Null when Places has none. */
  rating: number | null;
  ratingCount: number | null;
  /** The place's Google Maps page (menu, photos, reviews). */
  mapsUri: string | null;
  /** Up to 5 photos, food-first, for flipping through on the card. */
  photos: PlacePhoto[];
  /** Google's cover photo, usually the storefront: shown in the details. */
  storefront: PlacePhoto | null;
  /** "(415) 555-0134" to show, "+1 415-555-0134" to dial. */
  phone: string | null;
  phoneDial: string | null;
  /** Google says it takes reservations. null = unknown. */
  reservable: boolean | null;
}

export interface PlacePhoto {
  name: string;
  author: string | null;
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.types",
  "places.location",
  "places.shortFormattedAddress",
  "places.priceLevel",
  "places.paymentOptions",
  "places.websiteUri",
  "places.currentOpeningHours.openNow",
  "places.currentOpeningHours.nextCloseTime",
  "places.photos.name",
  // Google requires the photographer's credit wherever a Places photo is shown.
  "places.photos.authorAttributions",
  "places.editorialSummary",
  "places.servesVegetarianFood",
  "places.takeout",
  "places.delivery",
  // Same billing tier as the fields above (paymentOptions etc. are already the top tier), so no extra cost.
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  // Same tier again: for "Call to reserve" on the journey screen.
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.reservable",
].join(",");

const INCLUDED_TYPES = ["restaurant", "cafe", "bakery", "meal_takeaway", "sandwich_shop", "ice_cream_shop", "dessert_shop"];

const PRICE: Record<string, PriceLevel | null> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  primaryType?: string;
  types?: string[];
  location?: { latitude: number; longitude: number };
  shortFormattedAddress?: string;
  priceLevel?: string;
  paymentOptions?: PaymentOptions;
  websiteUri?: string;
  currentOpeningHours?: { openNow?: boolean; nextCloseTime?: string };
  photos?: { name: string; authorAttributions?: { displayName?: string }[] }[];
  editorialSummary?: { text?: string };
  servesVegetarianFood?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  reservable?: boolean;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Google doesn't say which photos show food, so this is a best guess, free of charge:
 * the first photo is Google's cover (most often the storefront), so it goes last; photos
 * posted by visitors come first, since diners mostly photograph their plates; the
 * business's own photos come after them.
 */
export function foodFirst(raw: RawPlace["photos"], placeName: string): { photos: PlacePhoto[]; storefront: PlacePhoto | null } {
  const all = (raw ?? [])
    .filter((p) => p.name)
    .map((p) => ({ name: p.name, author: p.authorAttributions?.[0]?.displayName?.slice(0, 80) ?? null }));
  if (all.length === 0) return { photos: [], storefront: null };
  const [cover, ...rest] = all;
  const place = squash(placeName);
  const byBusiness = (p: PlacePhoto) => {
    const a = squash(p.author ?? "");
    return a.length >= 4 && (place.includes(a) || a.includes(place));
  };
  const photos = [...rest.filter((p) => !byBusiness(p)), ...rest.filter(byBusiness), cover].slice(0, 5);
  return { photos, storefront: all.length > 1 ? cover : null };
}

function toPlace(r: RawPlace): Place | null {
  if (!r.id || !r.location || !r.displayName?.text) return null;
  const p = r.paymentOptions;
  const { photos, storefront } = foodFirst(r.photos, r.displayName.text);
  return {
    id: r.id,
    name: r.displayName.text,
    primaryType: r.primaryType ?? null,
    types: r.types ?? [],
    location: { lat: r.location.latitude, lng: r.location.longitude },
    address: r.shortFormattedAddress ?? "",
    priceLevel: r.priceLevel ? (PRICE[r.priceLevel] ?? null) : null,
    // Unknown stays unknown: we never guess payment methods.
    payment: p && Object.keys(p).length > 0 ? p : null,
    websiteUri: r.websiteUri ?? null,
    openNow: r.currentOpeningHours?.openNow ?? null,
    nextCloseTime: r.currentOpeningHours?.nextCloseTime ?? null,
    photoName: photos[0]?.name ?? null,
    photoAuthor: photos[0]?.author ?? null,
    photos,
    storefront,
    phone: r.nationalPhoneNumber?.slice(0, 40) ?? null,
    phoneDial: r.internationalPhoneNumber?.replace(/[^+\d]/g, "").slice(0, 20) || null,
    reservable: r.reservable ?? null,
    summary: r.editorialSummary?.text ?? null,
    servesVegetarianFood: r.servesVegetarianFood ?? null,
    takeout: r.takeout ?? null,
    delivery: r.delivery ?? null,
    rating: typeof r.rating === "number" && r.rating > 0 ? r.rating : null,
    ratingCount: r.userRatingCount ?? null,
    mapsUri: r.googleMapsUri?.startsWith("https://") ? r.googleMapsUri : null,
  };
}

/** Text Search can return shops and markets; keep places you can eat at. */
const FOOD_TYPES = new Set([...INCLUDED_TYPES, "food", "meal_delivery", "coffee_shop", "food_court", "deli", "bagel_shop", "donut_shop", "juice_shop", "tea_house"]);
const isFoodPlace = (p: Place) =>
  [p.primaryType, ...p.types].some((t) => t != null && (FOOD_TYPES.has(t) || t.endsWith("_restaurant")));

async function placesRequest(endpoint: "searchNearby" | "searchText", body: unknown): Promise<Place[]> {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.googleKey!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = (await res.json()) as { places?: RawPlace[] };
  // Drop anything not confirmed open right now.
  return (data.places ?? []).map(toPlace).filter((p): p is Place => p !== null && p.openNow === true);
}

const cache = new TtlCache<Place[]>(5 * 60_000);

/**
 * Nearby Search (New), open places only. "DISTANCE" gives the closest 20; "POPULARITY"
 * gives a different, better-known 20 for when those run out. Cached per ~1 km area for 5 minutes.
 */
export async function nearbyOpenPlaces(
  origin: LatLng,
  radiusMeters: number,
  rank: "DISTANCE" | "POPULARITY" = radiusMeters > 2000 ? "POPULARITY" : "DISTANCE",
): Promise<Place[]> {
  const center = roundToArea(origin);
  const key = `${areaKey(center)}:${radiusMeters}:${rank}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const places = await placesRequest("searchNearby", {
    includedTypes: INCLUDED_TYPES,
    maxResultCount: 20,
    rankPreference: rank,
    locationRestriction: {
      circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
    },
  });
  cache.set(key, places);
  return places;
}

/**
 * Text Search (New) for food matching words ("ramen", "salad bowl"), open now, near the
 * rounded area. Google's relevance order is kept. Only fixed queries (our own mood
 * words) are cached; a user's craving is used for this request only and never kept.
 */
export async function textSearchOpenPlaces(
  origin: LatLng,
  query: string,
  radiusMeters: number,
  opts: { cache: boolean },
): Promise<Place[]> {
  const center = roundToArea(origin);
  const key = `${areaKey(center)}:${radiusMeters}:q:${query}`;
  if (opts.cache) {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  const places = (
    await placesRequest("searchText", {
      textQuery: query,
      openNow: true,
      pageSize: 20,
      locationBias: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
      },
    })
  ).filter(isFoodPlace);
  if (opts.cache) cache.set(key, places);
  return places;
}

const geocodeCache = new TtlCache<LatLng | null>(10 * 60_000);

/** Neighborhood or ZIP → rounded area center. The query itself is not logged or stored. */
export async function geocodeArea(query: string): Promise<LatLng | null> {
  const q = query.trim().toLowerCase().slice(0, 80);
  if (!q) return null;
  const hit = geocodeCache.get(q);
  if (hit !== undefined) return hit;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("key", env.googleKey!);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = (await res.json()) as { results?: { geometry: { location: LatLng } }[] };
  const loc = data.results?.[0]?.geometry.location;
  const area = loc ? roundToArea(loc) : null;
  geocodeCache.set(q, area);
  return area;
}
