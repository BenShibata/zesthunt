import { beforeEach, describe, expect, it, vi } from "vitest";
import { findReturning, forgetAllWins, forgetWin, readWins, rememberWin } from "./wins";
import { inviteMessage } from "./links";
import type { Pick } from "./types";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  });
});

describe("remembered places", () => {
  it("keeps up to 5, newest first, without duplicates", () => {
    for (let i = 0; i < 7; i++) rememberWin({ placeId: `p${i}`, name: `Place ${i}` }, i);
    rememberWin({ placeId: "p3", name: "Place 3" }, 99);
    expect(readWins().map((w) => w.placeId)).toEqual(["p3", "p6", "p5", "p4", "p2"]);
  });

  it("forgets one or all", () => {
    rememberWin({ placeId: "a", name: "A" });
    rememberWin({ placeId: "b", name: "B" });
    expect(forgetWin("a").map((w) => w.placeId)).toEqual(["b"]);
    forgetAllWins();
    expect(readWins()).toEqual([]);
  });

  it("finds a remembered place among the picks", () => {
    const wins = rememberWin({ placeId: "b", name: "B" });
    expect(findReturning([{ placeId: "a" }, { placeId: "b" }], wins)).toBe(1);
    expect(findReturning([{ placeId: "c" }], wins)).toBe(-1);
  });

  it("survives broken storage", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "{not json", setItem: () => { throw new Error("full"); }, removeItem: () => {} } });
    expect(readWins()).toEqual([]);
    expect(() => rememberWin({ placeId: "a", name: "A" })).not.toThrow();
  });
});

describe("inviteMessage", () => {
  it("names the place and dish, links to the place, and never mentions the sender's location", () => {
    const pick = { name: "Kai Poke Bar", suggestion: "Try a tofu poke bowl", mapsUrl: "https://maps.google.com/?cid=1", closesAt: null, location: { lat: 1, lng: 2 } } as unknown as Pick;
    expect(inviteMessage(pick)).toEqual({ title: "Want to come to Kai Poke Bar?", text: "Want to come? Kai Poke Bar: a tofu poke bowl.", url: "https://maps.google.com/?cid=1" });
  });
});
