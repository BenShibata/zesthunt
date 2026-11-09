import { describe, expect, it } from "vitest";
import { buildMockQueue } from "./mockPicks";
import { foodSymbol, placeHue } from "./look";

const base = buildMockQueue("fresh", new Date("2026-11-09T19:00:00Z"), { firstOfSession: false, allMoods: true })[0];

describe("telling picks apart", () => {
  it("gives a symbol from the category, then from the place's type or name", () => {
    expect(foodSymbol({ ...base, category: "tacos" })).toBe("🌮");
    expect(foodSymbol({ ...base, category: null, kind: "Hot dog restaurant", name: "Dirty Frank's" })).toBe("🌭");
    expect(foodSymbol({ ...base, category: null, kind: "Japanese restaurant", name: "Osaka" })).toBe("🍣");
    expect(foodSymbol({ ...base, category: null, kind: undefined, placeTypes: [], name: "Plain Place" })).toBe("🍽️");
  });

  it("keeps the same color for the same place, and spreads different places apart", () => {
    expect(placeHue({ ...base, placeId: "ChIJabc" })).toBe(placeHue({ ...base, placeId: "ChIJabc" }));
    const hues = new Set(["a1", "b2", "c3", "d4", "e5", "f6"].map((id) => placeHue({ ...base, placeId: id })));
    expect(hues.size).toBeGreaterThan(4);
  });
});
