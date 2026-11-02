import { describe, expect, it } from "vitest";
import { dietaryBadge, dietaryShort } from "./useDietary";

describe("diet labels", () => {
  it("fits the top-bar button as first choice plus a count", () => {
    expect(dietaryShort({ diets: [], allergies: [] })).toBeNull();
    expect(dietaryShort({ diets: ["Vegan"], allergies: [] })).toBe("Vegan");
    expect(dietaryShort({ diets: ["Vegan"], allergies: ["Peanuts"] })).toBe("Vegan +1");
    expect(dietaryShort({ diets: [], allergies: ["Peanuts", "Soy"] })).toBe("Allergies");
    expect(dietaryShort({ diets: ["Halal", "Gluten-free"], allergies: ["Soy"] })).toBe("Halal +2");
  });

  it("keeps the full list for screen readers", () => {
    expect(dietaryBadge({ diets: ["Vegan"], allergies: ["Peanuts"] })).toBe("Vegan · Allergies");
  });
});
