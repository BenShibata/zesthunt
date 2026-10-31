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
  photoName: string | null;
  summary: string | null;
  servesVegetarianFood: boolean | null;
  takeout: boolean | null;
  delivery: boolean | null;
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
  "places.editorialSummary",
  "places.servesVegetarianFood",
  "places.takeout",
  "places.delivery",
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
  photos?: { name: string }[];
  editorialSummary?: { text?: string };
  servesVegetarianFood?: boolean;
  takeout?: boolean;
  delivery?: boolean;
}

function toPlace(r: RawPlace): Place | null {
  if (!r.id || !r.location || !r.displayName?.text) return null;
  const p = r.paymentOptions;
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
    photoName: r.photos?.[0]?.name ?? null,
    summary: r.editorialSummary?.text ?? null,
    servesVegetarianFood: r.servesVegetarianFood ?? null,
    takeout: r.takeout ?? null,
    delivery: r.delivery ?? null,
  };
}

const cache = new TtlCache<Place[]>(5 * 60_000);

/** Nearby Search (New), open places only. Cached per ~1 km area and radius for 5 minutes. */
export async function nearbyOpenPlaces(origin: LatLng, radiusMeters: number): Promise<Place[]> {
  const center = roundToArea(origin);
  const key = `${areaKey(center)}:${radiusMeters}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.googleKey!,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_TYPES,
      maxResultCount: 20,
      rankPreference: radiusMeters > 2000 ? "POPULARITY" : "DISTANCE",
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = (await res.json()) as { places?: RawPlace[] };
  // Nearby Search has no open-now filter, so drop anything not confirmed open.
  const places = (data.places ?? []).map(toPlace).filter((p): p is Place => p !== null && p.openNow === true);
  cache.set(key, places);
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
