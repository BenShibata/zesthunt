import { describe, expect, it } from "vitest";
import { dietaryBadge } from "./useDietary";

describe("what-you-eat labels", () => {
  it("never names people, only food", () => {
    const all = dietaryBadge({ diets: ["Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Dairy-free"], allergies: [] }) ?? "";
    expect(all).not.toMatch(/vegetarian|vegan|pescatarian/i);
  });

  it("spells everything out for screen readers", () => {
    expect(dietaryBadge({ diets: ["Vegetarian"], allergies: ["Peanuts", "Sesame"] })).toBe("No meat or fish; keeping away from peanuts, sesame");
  });
});
