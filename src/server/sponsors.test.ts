import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSponsors, sponsorDeal } from "./sponsors";

afterEach(() => vi.unstubAllEnvs());

describe("sponsors", () => {
  it("reads a JSON list and skips bad entries", () => {
    const m = parseSponsors(JSON.stringify([{ placeId: "a", deal: "10% off" }, { placeId: "b" }, { placeId: "c", deal: "x", url: "http://insecure" }]));
    expect([...m.keys()]).toEqual(["a"]);
    expect(parseSponsors("not json").size).toBe(0);
    expect(parseSponsors(undefined).size).toBe(0);
  });

  it("gives a place its deal until the end date, then stops", () => {
    vi.stubEnv("SPONSORS", JSON.stringify([{ placeId: "a", deal: "Free drink", url: "https://a.example", until: "2026-11-30" }]));
    expect(sponsorDeal("a", new Date("2026-11-30T23:00:00Z"))).toEqual({ deal: "Free drink", url: "https://a.example" });
    expect(sponsorDeal("a", new Date("2026-12-01T00:00:00Z"))).toBeUndefined();
    expect(sponsorDeal("other")).toBeUndefined();
  });
});
