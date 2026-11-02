import { describe, expect, it } from "vitest";
import { cravingShortcuts } from "./cravings";
import { ratingText } from "./time";

describe("cravingShortcuts", () => {
  it("fits the meal", () => {
    expect(cravingShortcuts("Breakfast")).toContain("coffee");
    expect(cravingShortcuts("Dinner")).toContain("pizza");
  });

  it("leaves out meat-led shortcuts for vegetarians", () => {
    expect(cravingShortcuts("Late night", ["Vegetarian"])).not.toContain("burgers");
    expect(cravingShortcuts("Late night", ["Vegetarian"])).not.toContain("fried chicken");
    expect(cravingShortcuts("Late night", ["Halal"])).toContain("burgers");
  });
});

describe("ratingText", () => {
  it("formats rating and count", () => {
    expect(ratingText(4.56, 1234)?.visual).toBe("4.6 (1.2k)");
    expect(ratingText(4, 18_400)?.visual).toBe("4.0 (18k)");
    expect(ratingText(4.2, 87)?.spoken).toBe("Rated 4.2 out of 5 from 87 ratings on Google");
  });

  it("returns null without a rating", () => {
    expect(ratingText(null, 10)).toBeNull();
    expect(ratingText(0, 0)).toBeNull();
  });
});
