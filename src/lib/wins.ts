/**
 * "Back to Kai Poke?": places you chose and asked to remember, kept only in this browser's
 * localStorage (opt-in per place, never sent anywhere). Next time, if one is open nearby
 * among the picks, it's offered first. Up to 5, newest first.
 */
const KEY = "zesthunt:wins:v1";
const MAX = 5;

export interface Win {
  placeId: string;
  name: string;
  /** When it was chosen (ms since epoch). */
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readWins(): Win[] {
  try {
    const raw = storage()?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((w): w is Win => typeof w?.placeId === "string" && typeof w?.name === "string" && typeof w?.at === "number")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(list: Win[]) {
  try {
    const s = storage();
    if (!s) return;
    if (list.length === 0) s.removeItem(KEY);
    else s.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Storage blocked or full: remembering is a nicety, so it just doesn't happen.
  }
}

export function rememberWin(place: { placeId: string; name: string }, now = Date.now()): Win[] {
  const list = [{ placeId: place.placeId, name: place.name.slice(0, 80), at: now }, ...readWins().filter((w) => w.placeId !== place.placeId)];
  write(list);
  return list.slice(0, MAX);
}

export function forgetWin(placeId: string): Win[] {
  const list = readWins().filter((w) => w.placeId !== placeId);
  write(list);
  return list;
}

export function forgetAllWins() {
  write([]);
}

/** The first remembered place among the picks, by position in the queue (or -1). */
export function findReturning(picks: { placeId: string }[], wins: Win[]): number {
  const ids = new Set(wins.map((w) => w.placeId));
  return picks.findIndex((p) => ids.has(p.placeId));
}
