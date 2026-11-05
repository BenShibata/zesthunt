import type { Dietary, Mood, PicksEvent } from "./types";

export interface PicksQuery {
  mood: Mood;
  /** Rounded to ~1 km on the device before it is sent. */
  location: { lat: number; lng: number } | null;
  areaQuery?: string | null;
  dietary?: Dietary | null;
  skipSignals?: string[];
  exclude?: string[];
  craving?: string | null;
  firstOfSession?: boolean;
  /** Search a short drive away (8 km) instead of a walk. */
  widen?: boolean;
  /** The ring the last refill reached (see lib/reach), so the next one starts there. */
  reach?: number;
}

/** Same rounding as the server: two decimals ≈ 1.1 km. */
export function roundCoords(lat: number, lng: number) {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/** Hour and minute only: the date isn't needed to frame a meal, so it isn't sent. */
function localTime(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The exact body sent to /api/picks, kept in memory for the "What we sent" receipt. */
export type SentRequest = PicksQuery & { localTime: string };

/**
 * Streams NDJSON events from /api/picks, calling onEvent for each line as it arrives.
 * onSent receives the exact body that goes over the wire, so the receipt can't drift from the truth.
 */
export async function streamPicks(
  query: PicksQuery,
  onEvent: (e: PicksEvent) => void,
  signal: AbortSignal,
  onSent?: (body: SentRequest) => void,
) {
  const body: SentRequest = { ...query, localTime: localTime() };
  onSent?.(body);
  const res = await fetch("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (res.status === 429) throw new Error("Too many requests. Give it a few seconds.");
  if (!res.ok || !res.body) throw new Error("Couldn't load picks.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as PicksEvent);
    }
  }
}

/** Precise location for this session only, kept in memory by the caller. */
export function requestPreciseLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/** On-device walking estimate (street grid ≈ 1.3× straight line at 80 m/min). Never sent anywhere. */
export function walkMinutesOnDevice(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(to.lat - from.lat) / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(rad(to.lng - from.lng) / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((meters * 1.3) / 80));
}
