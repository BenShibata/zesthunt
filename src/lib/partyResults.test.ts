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
    expect(r.winner).toEqual({ card: card("y"), likers: ["Taco", "Ramen", "Mochi"], loved: 0 });
    expect(r.others.map((o) => o.card.id)).toEqual(["w", "z"]);
    expect(r.voters).toBe(3);
  });

  it("leaves out cards nobody liked, and returns null if the match isn't in the deck", () => {
    expect(rankResult([card("x"), card("y")], { x: ["a"] }, members, "x")!.others).toEqual([]);
    expect(rankResult([card("x")], {}, members, "nope")).toBeNull();
  });

  it("ranks runners-up by points: Love it counts double", () => {
    const r = rankResult([card("x"), card("y"), card("z")], { y: ["a"], z: ["b", "c"], x: ["a"] }, members, "x", { y: ["a"] })!;
    // y: one love = 2 points; z: two OKs = 2 points; deck order breaks the tie.
    expect(r.others.map((o) => [o.card.id, o.loved])).toEqual([
      ["y", 1],
      ["z", 0],
    ]);
  });
});
