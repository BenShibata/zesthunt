import type { Mood, Pick } from "./types";

/**
 * "Not quite?" as one good guess instead of a menu: what the last few skips have in common
 * suggests the single nudge most likely to help. The full set of choices is a tap away.
 */
export type SteerGuess = { kind: "mood"; mood: Mood; text: string } | { kind: "surprise"; text: string };

export const STEER_TEXT: Record<Mood, string> = {
  fresh: "Something lighter?",
  comfort: "Something heartier?",
  fast: "Something quicker?",
  cheap: "Something cheaper?",
  treat: "Something special?",
};

/** If the skipped picks lean one way, the other way is the likeliest fix. */
const OTHER_WAY: Record<Mood, Mood> = {
  fresh: "comfort",
  comfort: "fresh",
  fast: "treat",
  cheap: "treat",
  treat: "cheap",
};

/** How many of the latest skips to read. */
const RECENT = 3;

export function steerGuess(skipped: Pick[], mood: Mood): SteerGuess {
  const recent = skipped.slice(-RECENT);
  const most = (test: (p: Pick) => boolean) => recent.length > 0 && recent.filter(test).length * 2 > recent.length;
  const offer = (m: Mood): SteerGuess => (m === mood ? { kind: "surprise", text: "Surprise me?" } : { kind: "mood", mood: m, text: STEER_TEXT[m] });

  if (most((p) => (p.priceLevel ?? 0) >= 3)) return offer("cheap");
  if (most((p) => p.travelMode === "drive" || p.walkMinutes >= 12)) return offer("fast");

  const counts = new Map<Mood, number>();
  for (const p of recent) if (p.moods[0]) counts.set(p.moods[0], (counts.get(p.moods[0]) ?? 0) + 1);
  const [lean] = [...counts.entries()].sort((a, b) => b[1] - a[1]).find(([, n]) => n * 2 > recent.length) ?? [];
  return lean ? offer(OTHER_WAY[lean]) : { kind: "surprise", text: "Surprise me?" };
}
