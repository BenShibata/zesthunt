import { describe, expect, it } from "vitest";
import type { PartyCard } from "./types";
import { misfit, tooLate } from "./partyFit";

const card = (extra: Partial<PartyCard>) => ({ id: "x", name: "Place", suggestion: "Try something", category: null, placeTypes: [], vegetarianOptions: null, closesAt: null, ...extra }) as PartyCard;
const eats = (diets: string[], allergies: string[] = []) => ({ diets, allergies });

describe("misfit", () => {
  it("fits everyone with no needs set", () => {
    expect(misfit(card({ category: "steak and BBQ" }), eats([]))).toBeNull();
  });

  it("removes places Google says have no vegetarian food, for no meat or fish", () => {
    expect(misfit(card({ vegetarianOptions: false }), eats(["Vegetarian"]))).toBe("no vegetarian options");
    expect(misfit(card({ vegetarianOptions: false }), eats(["Pescatarian"]))).toBeNull();
  });

  it("removes meat-led places unless Google says they have vegetarian food", () => {
    expect(misfit(card({ placeTypes: ["steak_house"] }), eats(["Vegan"]))).toBe("meat-led");
    expect(misfit(card({ placeTypes: ["steak_house"], vegetarianOptions: true }), eats(["Vegan"]))).toBeNull();
    // Dish categories are plural ("burgers"); that has to count too.
    expect(misfit(card({ category: "burgers" }), eats(["Vegetarian"]))).toBe("meat-led");
    expect(misfit(card({ category: "sandwiches" }), eats(["Gluten-free"]))).toBe("wheat-led");
  });

  it("keeps fish for fish-but-no-meat, removes it for no meat or fish", () => {
    expect(misfit(card({ suggestion: "Try a salmon poke bowl" }), eats(["Pescatarian"]))).toBeNull();
    expect(misfit(card({ suggestion: "Try a salmon poke bowl" }), eats(["Vegetarian"]))).toBe("fish-led");
  });

  it("handles halal, kosher, no gluten, no dairy and allergies by place type and dish", () => {
    expect(misfit(card({ placeTypes: ["barbecue_restaurant"] }), eats(["Halal"]))).toBe("pork-led");
    expect(misfit(card({ placeTypes: ["seafood_restaurant"] }), eats(["Kosher"]))).toBe("shellfish");
    expect(misfit(card({ placeTypes: ["pizza_restaurant"] }), eats(["Gluten-free"]))).toBe("wheat-led");
    expect(misfit(card({ placeTypes: ["ice_cream_shop"] }), eats(["Dairy-free"]))).toBe("dairy-led");
    expect(misfit(card({ suggestion: "Try the shrimp tacos" }), eats([], ["Shellfish"]))).toBe("allergy");
    expect(misfit(card({ suggestion: "Try the pad thai" }), eats([], ["Peanuts"]))).toBe("allergy");
    expect(misfit(card({ suggestion: "Try a veggie curry" }), eats(["Halal", "Gluten-free"], ["Peanuts"]))).toBeNull();
  });
});

describe("tooLate", () => {
  const now = new Date("2026-11-04T19:00:00Z");
  const closesIn = (min: number) => new Date(now.getTime() + min * 60000).toISOString();

  it("needs time to vote, get there and eat", () => {
    // 10 to vote + 15 to walk + 30 to eat = 55 minutes.
    expect(tooLate(card({ closesAt: closesIn(50) }), 15, now)).toBe(true);
    expect(tooLate(card({ closesAt: closesIn(60) }), 15, now)).toBe(false);
  });

  it("assumes yes when hours or travel are unknown", () => {
    expect(tooLate(card({ closesAt: null }), 15, now)).toBe(false);
    expect(tooLate(card({ closesAt: closesIn(5) }), null, now)).toBe(false);
  });
});
