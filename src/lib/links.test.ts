import { describe, expect, it } from "vitest";
import { bookTableUrl, tagLink } from "./links";
import { buildMockQueue } from "./mockPicks";

describe("tagLink", () => {
  const dest = "https://www.doordash.com/search/store/Kai%20Poke/";

  it("leaves links plain when no referral is set up", () => {
    expect(tagLink(dest, undefined)).toBe(dest);
    expect(tagLink(dest, "  ")).toBe(dest);
  });

  it("wraps the destination in a tracking link with {url}", () => {
    expect(tagLink(dest, "https://doordash.pxf.io/c/1/2/3?u={url}")).toBe(`https://doordash.pxf.io/c/1/2/3?u=${encodeURIComponent(dest)}`);
  });

  it("adds plain parameters otherwise", () => {
    expect(tagLink("https://www.opentable.com/s?term=Kai", "ref=zesthunt&utm_source=zesthunt")).toBe(
      "https://www.opentable.com/s?term=Kai&ref=zesthunt&utm_source=zesthunt",
    );
  });
});

describe("bookTableUrl", () => {
  const pick = buildMockQueue("fresh", new Date(), { firstOfSession: false })[0];

  it("offers booking only when Google says the place takes reservations", () => {
    expect(bookTableUrl({ ...pick, reservable: true })).toContain("opentable.com/s?term=");
    expect(bookTableUrl({ ...pick, reservable: false })).toBeNull();
    expect(bookTableUrl({ ...pick, reservable: null })).toBeNull();
  });
});
