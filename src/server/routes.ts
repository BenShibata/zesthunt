import "server-only";
import { env } from "./env";
import { areaKey, estimateWalkMinutes, haversineMeters, roundToArea, type LatLng } from "./geo";
import { TtlCache } from "./memory";

export interface Travel {
  minutes: number;
  meters: number;
  /** True when Routes was unavailable and we fell back to a straight-line estimate. */
  estimated: boolean;
}

const cache = new TtlCache<Travel>(10 * 60_000, 5000);

/**
 * Walking (or driving) times from the rounded origin to each destination: a distance
 * estimate by default (free), or the Routes API route matrix when USE_ROUTES_API=true.
 */
export async function travelTimes(
  origin: LatLng,
  destinations: { id: string; location: LatLng }[],
  mode: "WALK" | "DRIVE",
): Promise<Map<string, Travel>> {
  const from = roundToArea(origin);
  const out = new Map<string, Travel>();
  const todo = destinations.filter((d) => {
    const hit = cache.get(`${areaKey(from)}:${d.id}:${mode}`);
    if (hit) out.set(d.id, hit);
    return !hit;
  });

  // Routes is a paid call per place; by default the distance estimate below is used instead.
  if (todo.length > 0 && env.useRoutes) {
    try {
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.googleKey!,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        body: JSON.stringify({
          origins: [{ waypoint: { location: { latLng: { latitude: from.lat, longitude: from.lng } } } }],
          destinations: todo.map((d) => ({
            waypoint: { location: { latLng: { latitude: d.location.lat, longitude: d.location.lng } } },
          })),
          travelMode: mode,
        }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`routes ${res.status}`);
      const rows = (await res.json()) as {
        destinationIndex: number;
        duration?: string;
        distanceMeters?: number;
        condition?: string;
      }[];
      for (const row of rows) {
        const dest = todo[row.destinationIndex];
        if (!dest || row.condition !== "ROUTE_EXISTS" || !row.duration) continue;
        const travel: Travel = {
          minutes: Math.max(1, Math.round(parseInt(row.duration, 10) / 60)),
          meters: row.distanceMeters ?? 0,
          estimated: false,
        };
        out.set(dest.id, travel);
        cache.set(`${areaKey(from)}:${dest.id}:${mode}`, travel);
      }
    } catch {
      // Fall through to estimates below; a missing walk time should never block a pick.
    }
  }

  for (const d of destinations) {
    if (out.has(d.id)) continue;
    const meters = Math.round(haversineMeters(from, d.location));
    const minutes = mode === "WALK" ? estimateWalkMinutes(meters) : Math.max(2, Math.round((meters * 1.4) / 400));
    out.set(d.id, { minutes, meters, estimated: true });
  }
  return out;
}
