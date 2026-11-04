import { describe, expect, it } from "vitest";
import type { PartyCard } from "./types";
import { rankResult } from "./partyResults";

const card = (id: string) => ({ id, name: id }) as PartyCard;
const members = [
  { id: "a", nickname: "Taco" },
  { id: "b", nickname: "Ramen" },
  { id: "c", nickname: "Mochi" },
];

describe("rankResult", () => {
  it("puts the group's pick first with who liked it, then the next two most-liked", () => {
    const r = rankResult([card("x"), card("y"), card("z"), card("w")], { y: ["a", "b", "c"], z: ["a"], w: ["b", "c"] }, members, "y")!;
    expect(r.winner).toEqual({ card: card("y"), likers: ["Taco", "Ramen", "Mochi"] });
    expect(r.others.map((o) => o.card.id)).toEqual(["w", "z"]);
    expect(r.voters).toBe(3);
  });

  it("leaves out cards nobody liked, and returns null if the match isn't in the deck", () => {
    expect(rankResult([card("x"), card("y")], { x: ["a"] }, members, "x")!.others).toEqual([]);
    expect(rankResult([card("x")], {}, members, "nope")).toBeNull();
  });
});
