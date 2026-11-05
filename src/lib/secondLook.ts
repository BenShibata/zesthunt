import type { Pick } from "./types";

/** Same margin as the server: a place you'd reach with less than this before closing is out. */
const ARRIVE_WITH_MINUTES = 10;

/**
 * After the farthest ring, the hunt goes round again: the places you passed, in the order
 * they were first shown (best first), once each. Places already coming up are left out, and
 * so is anywhere that would close before you got there (certain, not a guess).
 */
export function secondLookRound(skipped: Pick[], ahead: Pick[], now: number): Pick[] {
  const seen = new Set(ahead.map((p) => p.placeId));
  const round: Pick[] = [];
  for (const p of skipped) {
    if (seen.has(p.placeId)) continue;
    seen.add(p.placeId);
    if (p.closesAt && (Date.parse(p.closesAt) - now) / 60000 < p.walkMinutes + ARRIVE_WITH_MINUTES) continue;
    round.push({ ...p, secondLook: true });
  }
  return round;
}

/** Places already shown or coming up, for the server's exclude list: each once, newest kept if it's long. */
export function seenIds(lists: Pick[][], max = 300): string[] {
  const ids = [...new Set(lists.flat().map((p) => p.placeId))];
  return ids.slice(-max);
}
