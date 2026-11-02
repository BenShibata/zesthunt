import { describe, expect, it } from "vitest";
import { createPicksScanner } from "./rank";

function scan(chunks: string[]) {
  const out: string[] = [];
  const feed = createPicksScanner((json) => out.push(json));
  for (const c of chunks) feed(c);
  return out;
}

describe("createPicksScanner", () => {
  const full = '{"picks": [{"id":"p1","plate":{"veg":2}}, {"id":"p2","reason":"a } and { in text \\" quoted"}]}';

  it("emits each pick object once it closes", () => {
    const out = scan([full]);
    expect(out.map((s) => JSON.parse(s).id)).toEqual(["p1", "p2"]);
  });

  it("handles any chunk boundary, including inside strings and escapes", () => {
    for (let i = 1; i < full.length; i++) {
      const out = scan([full.slice(0, i), full.slice(i)]);
      expect(out.map((s) => JSON.parse(s).id)).toEqual(["p1", "p2"]);
    }
  });

  it("emits a pick before the array has finished", () => {
    expect(scan(['{"picks":[{"id":"p1"},{"id":"p2"'])).toEqual(['{"id":"p1"}']);
  });
});
