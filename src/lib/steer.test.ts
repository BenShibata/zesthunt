import { describe, expect, it } from "vitest";
import { buildMockQueue } from "./mockPicks";
import { steerGuess } from "./steer";
import type { Pick } from "./types";

const base = buildMockQueue("fresh", new Date("2026-11-05T19:00:00Z"), { firstOfSession: false, allMoods: true })[0];
const pick = (extra: Partial<Pick>): Pick => ({ ...base, priceLevel: 2, walkMinutes: 6, travelMode: "walk", ...extra });

describe("steerGuess", () => {
  it("offers cheaper when most recent skips were pricey", () => {
    const g = steerGuess([pick({ priceLevel: 3 }), pick({ priceLevel: 4 }), pick({})], "fresh");
    expect(g).toEqual({ kind: "mood", mood: "cheap", text: "Something cheaper?" });
  });

  it("offers quicker when most recent skips were far", () => {
    expect(steerGuess([pick({ walkMinutes: 15 }), pick({ travelMode: "drive" })], "fresh")).toMatchObject({ mood: "fast" });
  });

  it("offers the other way from what the skips lean toward", () => {
    const heavy = [pick({ moods: ["comfort"] }), pick({ moods: ["comfort", "treat"] }), pick({ moods: ["fresh"] })];
    expect(steerGuess(heavy, "comfort")).toEqual({ kind: "mood", mood: "fresh", text: "Something lighter?" });
  });

  it("offers a surprise when there's no clear lean, or the guess is the current mood", () => {
    expect(steerGuess([pick({ moods: ["fresh"] }), pick({ moods: ["fast"] }), pick({ moods: ["treat"] })], "fresh")).toEqual({ kind: "surprise", text: "Surprise me?" });
    expect(steerGuess([pick({ moods: ["comfort"] }), pick({ moods: ["comfort"] })], "fresh")).toEqual({ kind: "surprise", text: "Surprise me?" });
  });

  it("only reads the latest few skips", () => {
    const old = [pick({ priceLevel: 4 }), pick({ priceLevel: 4 }), pick({ priceLevel: 4 })];
    const fresh = [pick({ moods: ["fresh"] }), pick({ moods: ["fresh"] }), pick({ moods: ["fresh"] })];
    expect(steerGuess([...old, ...fresh], "fast")).toMatchObject({ mood: "comfort" });
  });
});
