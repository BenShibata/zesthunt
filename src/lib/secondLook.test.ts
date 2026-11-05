import { describe, expect, it } from "vitest";
import { buildMockQueue } from "./mockPicks";
import { secondLookRound, seenIds } from "./secondLook";

const now = new Date("2026-11-05T19:00:00Z");
const [a, b, c, d] = buildMockQueue("fresh", now, { firstOfSession: false, allMoods: true });

describe("secondLookRound", () => {
  it("brings back passed places once each, in the order first shown, marked as a second look", () => {
    const round = secondLookRound([a, b, a, c], [], now.getTime());
    expect(round.map((p) => p.placeId)).toEqual([a.placeId, b.placeId, c.placeId]);
    expect(round.every((p) => p.secondLook)).toBe(true);
  });

  it("leaves out places already coming up", () => {
    const round = secondLookRound([a, b, c], [b], now.getTime());
    expect(round.map((p) => p.placeId)).toEqual([a.placeId, c.placeId]);
  });

  it("leaves out only places that would close before you got there", () => {
    const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();
    const closing = { ...a, walkMinutes: 6, closesAt: at(12) };
    const fine = { ...b, walkMinutes: 6, closesAt: at(20) };
    const round = secondLookRound([closing, fine, d], [], now.getTime());
    expect(round.map((p) => p.placeId)).toEqual([b.placeId, d.placeId]);
  });
});

describe("seenIds", () => {
  it("lists each place once and keeps the newest when the list is long", () => {
    expect(seenIds([[a, b], [b, c]])).toEqual([a.placeId, b.placeId, c.placeId]);
    expect(seenIds([[a, b, c]], 2)).toEqual([b.placeId, c.placeId]);
  });
});
