import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pick, PicksEvent } from "@/lib/types";
import type { Place } from "./places";
import type { RankedPick } from "./prompts";

// Live mode with both keys, but Google and Claude are stand-ins.
vi.mock("./env", () => ({
  env: { googleKey: "test", anthropicKey: "test", anthropicModel: "test", mcpDailyLimit: 2000 },
  isDemo: () => false,
}));

const places = vi.hoisted(() => ({ list: [] as Place[], popular: [] as Place[], text: {} as Record<string, Place[]>, drive: null as Place[] | null }));
vi.mock("./places", () => ({
  nearbyOpenPlaces: vi.fn(async (_o: unknown, radius: number, rank?: string) =>
    radius > 2000 ? (places.drive ?? places.list) : rank === "POPULARITY" ? places.popular : places.list,
  ),
  textSearchOpenPlaces: vi.fn(async (_o: unknown, query: string) => places.text[query] ?? []),
  geocodeArea: vi.fn(async () => null),
}));

vi.mock("./routes", () => ({
  travelTimes: vi.fn(async (_origin: unknown, dests: { id: string }[]) => new Map(dests.map((d, i) => [d.id, { minutes: 5 + i, meters: 400 + i * 80, estimated: false }]))),
}));

const ranked = vi.hoisted(() => ({ picks: [] as RankedPick[], fail: false }));
vi.mock("./rank", () => ({
  rankWithClaude: async function* () {
    if (ranked.fail) throw new Error("boom");
    yield* ranked.picks;
  },
}));

const { runPipeline } = await import("./pipeline");
const placesApi = await import("./places");
const { profileFor } = await import("./heuristics");

function place(id: string, extra: Partial<Place> = {}): Place {
  return {
    id,
    name: `Place ${id}`,
    primaryType: "restaurant",
    types: ["restaurant"],
    location: { lat: 37.77, lng: -122.42 },
    address: "",
    priceLevel: null,
    payment: null,
    websiteUri: null,
    openNow: true,
    nextCloseTime: null,
    photoName: null,
    photoAuthor: null,
    summary: null,
    servesVegetarianFood: null,
    takeout: null,
    delivery: null,
    rating: null,
    ratingCount: null,
    mapsUri: null,
    ...extra,
  };
}

function rankedPick(id: string, extra: Partial<RankedPick> = {}): RankedPick {
  return { id, suggestion: "Try the noodle bowl", reason: "Quick and bright", plate: { protein: 1, veg: 1, grain: 1 }, labels: [], upgrade_tip: null, moods: ["fast"], ...extra };
}

async function run(body: Partial<Parameters<typeof runPipeline>[0]> = {}) {
  const events: PicksEvent[] = [];
  const req = { localTime: "12:30", mood: "fast" as const, location: { lat: 37.77, lng: -122.42 }, ...body };
  for await (const e of runPipeline(req, new Headers(), new AbortController().signal)) events.push(e);
  const picks = events.filter((e): e is { type: "pick"; pick: Pick } => e.type === "pick").map((e) => e.pick);
  return { events, picks };
}

// ~5 km from the origin: outside a walk, inside a short drive.
const FAR = { lat: 37.815, lng: -122.42 };

beforeEach(() => {
  vi.clearAllMocks();
  places.list = ["a", "b", "c", "d", "e", "f"].map((id) => place(id));
  places.popular = [];
  places.text = {};
  places.drive = null;
  ranked.picks = [];
  ranked.fail = false;
});

describe("runPipeline (live)", () => {
  it("drops invented and repeated places from Claude, then tops up from real places", async () => {
    // Candidates are sent to Claude as p1..p6 in walking order (a..f).
    ranked.picks = [rankedPick("p2"), rankedPick("p99"), rankedPick("p2"), rankedPick("p1")];
    const { picks, events } = await run();
    expect(picks.slice(0, 2).map((p) => p.id)).toEqual(["b", "a"]);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
    expect(picks.every((p) => places.list.some((pl) => pl.id === p.id))).toBe(true);
    expect(picks).toHaveLength(6);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("replaces calorie or diet talk and suggestions that don't start with Try", async () => {
    ranked.picks = [
      rankedPick("p1", { reason: "Only 400 calories", upgrade_tip: "Skip the junk" }),
      rankedPick("p2", { suggestion: "The noodle bowl is great" }),
    ];
    const { picks } = await run();
    const fallback = profileFor(places.list[0]);
    expect(picks[0].reason).toBe(fallback.reason);
    expect(picks[0].upgradeTip).toBeUndefined();
    expect(picks[1].suggestion).toBe(profileFor(places.list[1]).suggestion);
  });

  it("filters out places that can't serve vegetarians and swaps meat suggestions", async () => {
    places.list = [place("a", { servesVegetarianFood: false }), place("b"), place("c"), place("d"), place("e"), place("f")];
    ranked.picks = [rankedPick("p1", { suggestion: "Try the chicken bowl" })];
    const { picks } = await run({ dietary: { diets: ["Vegan"], allergies: [] } });
    expect(picks.map((p) => p.id)).not.toContain("a");
    expect(picks[0].suggestion).toBe("Try their vegan options");
    expect(picks.every((p) => !/chicken|beef|pork/i.test(p.suggestion))).toBe(true);
  });

  it("still serves rule-based picks when Claude fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ranked.fail = true;
    const { picks, events } = await run();
    expect(picks).toHaveLength(6);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("skips places the phone has already seen", async () => {
    const { picks } = await run({ exclude: ["a", "b"] });
    expect(picks.map((p) => p.id)).not.toContain("a");
    expect(picks.map((p) => p.id)).not.toContain("b");
  });

  it("asks for a location when it has none", async () => {
    const { events } = await run({ location: null });
    expect(events).toEqual([{ type: "need_location" }]);
  });

  it("passes ratings and the Maps link through to the pick", async () => {
    places.list = [place("a", { rating: 4.6, ratingCount: 812, mapsUri: "https://maps.google.com/?cid=1" }), ...places.list.slice(1)];
    const { picks } = await run();
    const a = picks.find((p) => p.id === "a")!;
    expect(a).toMatchObject({ rating: 4.6, ratingCount: 812, mapsUrl: "https://maps.google.com/?cid=1" });
  });
});

describe("runPipeline: finding more", () => {
  it("searches for the craving and keeps Google's relevance order", async () => {
    ranked.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    places.text = { ramen: [place("r2"), place("r1"), place("r3")] };
    const { picks, events } = await run({ craving: "ramen" });
    expect(picks.map((p) => p.id)).toEqual(["r2", "r1", "r3"]);
    expect(events[0]).toMatchObject({ type: "meta", mode: "walk", cravingMatched: true });
    // A user's craving is never cached on the server.
    expect(placesApi.textSearchOpenPlaces).toHaveBeenCalledWith(expect.anything(), "ramen", 1500, { cache: false });
  });

  it("drives for a craving when nothing matching is walkable", async () => {
    places.text = { ramen: [place("r1", { location: FAR })] };
    const { picks, events } = await run({ craving: "ramen" });
    expect(picks.map((p) => p.id)).toEqual(["r1"]);
    expect(events[0]).toMatchObject({ mode: "drive", cravingMatched: true });
  });

  it("says so and shows what's open when nothing matches the craving", async () => {
    const { picks, events } = await run({ craving: "durian pizza" });
    expect(events[0]).toMatchObject({ type: "meta", cravingMatched: false });
    expect(picks.length).toBeGreaterThan(0);
  });

  it("adds popular places and a mood search when the nearest run low", async () => {
    places.popular = [place("p1"), place("a"), place("far", { location: FAR })];
    places.text = { "salad poke healthy bowl": [place("s1")] };
    const { picks } = await run({ mood: "fresh" });
    const ids = picks.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "p1", "s1"]));
    expect(ids).not.toContain("far");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("doesn't spend extra searches when the nearest are plenty", async () => {
    places.list = Array.from({ length: 12 }, (_, i) => place(`n${i}`));
    await run();
    expect(placesApi.nearbyOpenPlaces).toHaveBeenCalledTimes(1);
    expect(placesApi.textSearchOpenPlaces).not.toHaveBeenCalled();
  });

  it("searches a short drive when asked, without calling it sparse", async () => {
    places.drive = [place("d1", { location: FAR }), place("d2", { location: FAR })];
    const { picks, events } = await run({ widen: true });
    expect(events[0]).toMatchObject({ mode: "drive", sparse: false });
    expect(picks.map((p) => p.id).sort()).toEqual(["d1", "d2"]);
  });

  it("leaves out only places that close before you could realistically get there", async () => {
    const soon = (min: number) => new Date(Date.now() + min * 60000).toISOString();
    // Travel in the mock is 5 + i minutes: a (5 min away) needs 15 minutes open, b (6 min away) needs 16.
    places.list = [place("a", { nextCloseTime: soon(12) }), place("b", { nextCloseTime: soon(20) }), place("c"), place("d"), place("e"), place("f")];
    const { picks } = await run();
    expect(picks.map((p) => p.id)).not.toContain("a");
    expect(picks.map((p) => p.id)).toContain("b");
  });

  it("says so when everything closes too soon", async () => {
    places.list = ["a", "b", "c", "d", "e", "f"].map((id) => place(id, { nextCloseTime: new Date(Date.now() + 10 * 60000).toISOString() }));
    const { events } = await run();
    expect(events.at(-1)).toMatchObject({ type: "empty", message: expect.stringMatching(/closes before/) });
  });

  it("carries the photographer's name with a Places photo (Google requires the credit)", async () => {
    places.list = [place("a", { photoName: "places/a/photos/p1", photoAuthor: "Sam Lee" }), ...places.list.slice(1)];
    const { picks } = await run();
    expect(picks.find((p) => p.id === "a")!.photo).toMatchObject({ kind: "url", attribution: "Sam Lee" });
  });
});
