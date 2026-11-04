import { describe, expect, it } from "vitest";
import { cantEatHints, dietSafeSuggestion } from "./categories";

describe("dietSafeSuggestion", () => {
  it("leaves suggestions alone with no diet set", () => {
    expect(dietSafeSuggestion("Try the pork ramen", [])).toBe("Try the pork ramen");
  });

  it("replaces meat for vegetarians and vegans", () => {
    expect(dietSafeSuggestion("Try the chicken shawarma", ["Vegetarian"])).toBe("Try their vegetarian options");
    expect(dietSafeSuggestion("Try the beef pho", ["Vegan"])).toBe("Try their vegan options");
  });

  it("replaces fish for vegetarians but keeps it for pescatarians", () => {
    expect(dietSafeSuggestion("Try a salmon poke bowl", ["Vegetarian"])).toBe("Try their vegetarian options");
    expect(dietSafeSuggestion("Try a salmon poke bowl", ["Pescatarian"])).toBe("Try a salmon poke bowl");
    expect(dietSafeSuggestion("Try the chicken katsu", ["Pescatarian"])).toBe("Try their vegetarian options");
  });

  it("keeps explicitly plant-based dishes", () => {
    expect(dietSafeSuggestion("Try the tofu banh mi", ["Vegan"])).toBe("Try the tofu banh mi");
  });

  it("doesn't touch diets that allow meat", () => {
    expect(dietSafeSuggestion("Try the chicken shawarma", ["Halal"])).toBe("Try the chicken shawarma");
  });
});

describe("cantEatHints", () => {
  const pick = (suggestion: string, category: string | null = null) => ({ suggestion, category }) as Parameters<typeof cantEatHints>[0];

  it("offers no-meat choices for a meat dish", () => {
    expect(cantEatHints(pick("Try the chicken shawarma")).diets).toEqual(["Vegetarian", "Pescatarian"]);
  });

  it("offers fish and shellfish allergies for seafood", () => {
    expect(cantEatHints(pick("Try a salmon poke bowl", "poke bowls"))).toEqual({ diets: ["Vegetarian"], allergies: ["Fish"] });
    expect(cantEatHints(pick("Try the shrimp tacos")).allergies).toEqual(["Shellfish"]);
  });

  it("offers gluten and dairy for pizza", () => {
    expect(cantEatHints(pick("Try a margherita pizza", "pizza")).diets).toEqual(["Gluten-free", "Dairy-free"]);
  });

  it("offers nothing when the dish gives no hint", () => {
    expect(cantEatHints(pick("Try a quick sit-down lunch here"))).toEqual({ diets: [], allergies: [] });
  });
});
