import { describe, expect, it } from "vitest";
import { buildMockQueue } from "./mockPicks";
import { fitsWishes, summarizeWishes, wishLine } from "./wishes";

const picks = buildMockQueue("fresh", new Date("2026-11-09T19:00:00Z"), { firstOfSession: false, allMoods: true });
const ramen = picks.find((p) => /ramen/i.test(p.suggestion))!;

describe("group wishes", () => {
  it("sums up what works for everyone, with no names", () => {
    const s = summarizeWishes([
      { price: 2, reach: "drive", crave: ["ramen", "tacos"] },
      { price: 3, reach: "walk", crave: ["ramen"] },
      { price: null, reach: null, crave: [] },
    ]);
    expect(s).toEqual({ count: 3, price: 2, reach: "walk", crave: ["ramen", "tacos"] });
    expect(wishLine(s)).toBe("$$ or less · walking distance · ramen, tacos");
  });

  it("checks a place against the wishes, counting unknowns as fitting", () => {
    const s = summarizeWishes([{ price: 2, reach: null, crave: ["ramen"] }]);
    expect(fitsWishes({ ...ramen, priceLevel: 2 }, s)).toBe(true);
    expect(fitsWishes({ ...ramen, priceLevel: null }, s)).toBe(true);
    expect(fitsWishes({ ...ramen, priceLevel: 3 }, s)).toBe(false);
    expect(fitsWishes({ ...picks[0], suggestion: "Try a salad" , name: "Green", category: "salad" }, s)).toBe(false);
    expect(fitsWishes(ramen, summarizeWishes([]))).toBe(false);
  });
});
