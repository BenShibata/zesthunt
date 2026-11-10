import { describe, expect, it } from "vitest";
import { aimAt, aimTargets } from "./aim";

const all = { order: true, call: true };

describe("aimAt", () => {
  it("is the journey screen straight down", () => {
    expect(aimAt(0, all)).toBe("journey");
    expect(aimAt(45, all)).toBe("journey");
    expect(aimAt(-45, all)).toBe("journey");
  });

  it("aims left for directions, further left to order, right to call", () => {
    expect(aimAt(-60, all)).toBe("directions");
    expect(aimAt(-120, all)).toBe("directions");
    expect(aimAt(-150, all)).toBe("order");
    expect(aimAt(60, all)).toBe("call");
  });

  it("falls back when a target doesn't apply to the place", () => {
    const none = { order: false, call: false };
    expect(aimAt(-150, none)).toBe("directions");
    expect(aimAt(80, none)).toBe("journey");
    expect(aimTargets(none)).toEqual(["directions", "journey"]);
    expect(aimTargets(all)).toEqual(["order", "directions", "journey", "call"]);
  });
});
