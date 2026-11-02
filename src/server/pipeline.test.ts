import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pick, PicksEvent } from "@/lib/types";
import type { Place } from "./places";
import type { RankedPick } from "./prompts";

// Live mode with both keys, but Google and Claude are stand-ins.
vi.mock("./env", () => ({
  env: { googleKey: "test", anthropicKey: "test", anthropicModel: "test", mcpDailyLimit: 2000 },
  isDemo: () => false,
}));

const places = vi.hoisted(() => ({ list: [] as Place[] }));
vi.mock("./places", () => ({
  nearbyOpenPlaces: vi.fn(async () => places.list),
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
    summary: null,
    servesVegetarianFood: null,
    takeout: null,
    delivery: null,
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

beforeEach(() => {
  places.list = ["a", "b", "c", "d", "e", "f"].map((id) => place(id));
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
});
