import { describe, expect, it } from "vitest";
import { parseAmountToCents, splitCents } from "./split";

describe("parseAmountToCents", () => {
  it.each([
    ["84.50", 8450],
    ["$84.50", 8450],
    ["84,50", 8450],
    ["1,234.56", 123456],
    ["84", 8400],
    ["0.015", 2],
  ])("parses %s", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "0", "100001"])("rejects %j", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});

describe("splitCents", () => {
  it("adds up exactly when it doesn't divide evenly", () => {
    const shares = splitCents(10000, 3);
    expect(shares).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("always sums to the total", () => {
    for (let total = 1; total < 2000; total += 37) {
      for (let people = 1; people <= 12; people++) {
        const shares = splitCents(total, people);
        expect(shares).toHaveLength(people);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("treats fewer than one person as one", () => {
    expect(splitCents(500, 0)).toEqual([500]);
    expect(splitCents(500, 2.7)).toEqual([250, 250]);
  });
});
