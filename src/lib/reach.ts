/**
 * How far a search reaches, in rings. Picks never just stop: when everything open in one
 * ring has been seen, the next refill looks in the next ring out, and the phone says so.
 * After the last ring, the phone offers a second look at what was passed.
 */
export interface Reach {
  meters: number;
  mode: "walk" | "drive";
  /** For the line under the moods and the "going farther" notice. */
  label: string;
}

export const REACHES: readonly Reach[] = [
  { meters: 1500, mode: "walk", label: "walking distance" },
  { meters: 8000, mode: "drive", label: "a short drive" },
  { meters: 20000, mode: "drive", label: "a longer drive" },
  // Places searches can't go wider than 50 km.
  { meters: 50000, mode: "drive", label: "a long drive" },
];

export const MAX_REACH = REACHES.length - 1;

export function reachAt(i: number): Reach {
  return REACHES[Math.min(Math.max(0, Math.floor(i)), MAX_REACH)];
}
