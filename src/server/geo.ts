import "server-only";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Two decimals ≈ 1.1 km of latitude. Every coordinate is rounded to this before
 * it reaches a third party, a cache key or anything else on the server.
 * Trade-off: walking times are estimates from the middle of a ~1 km cell.
 */
const ROUND_DECIMALS = 2;

export function roundToArea(p: LatLng): LatLng {
  const f = 10 ** ROUND_DECIMALS;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

export function areaKey(p: LatLng): string {
  const r = roundToArea(p);
  return `${r.lat.toFixed(ROUND_DECIMALS)},${r.lng.toFixed(ROUND_DECIMALS)}`;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Street-grid walking estimate when Routes is unavailable: 1.3× straight line at 80 m/min. */
export function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round((meters * 1.3) / 80));
}

/**
 * City-level estimate from the platform's IP geolocation headers (Vercel sets these).
 * Read once per request, never stored or logged. Returns null when absent (e.g. local dev).
 */
export function coarseFromHeaders(h: Headers): LatLng | null {
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  if (!h.get("x-vercel-ip-latitude")) return null;
  return roundToArea({ lat, lng });
}

/** City name from the hosting platform's IP geolocation, shown back to the user in the receipt only. */
export function cityFromHeaders(h: Headers): string | null {
  const raw = h.get("x-vercel-ip-city");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 60);
  } catch {
    return null;
  }
}
