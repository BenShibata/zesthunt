import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyCard } from "@/lib/types";
import { resetUpstashForTests } from "./upstash";
import { resetRoomStoreForTests } from "./partyStore";
import { addPlace, bestPlace, createOpenParty, createParty, setWishes, decideNow, extendParty, joinParty, markUnfit, matchNeeded, partyState, PartyError, recordSwipe, renameMember, steerParty } from "./party";

const card = (id: string) => ({ id, placeId: id, name: id }) as PartyCard;

beforeEach(() => {
  // In-memory rooms: make sure no real database is configured.
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) vi.stubEnv(k, "");
  resetUpstashForTests();
  resetRoomStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hunt party", () => {
  it("matches only when every member says go on the same pick", async () => {
    const host = await createParty("Ana", [card("x"), card("y")]);
    const friend = await joinParty(host.code, "Ben");

    await recordSwipe(host.code, host.memberId, host.key, "x", "go");
    await recordSwipe(friend.code, friend.memberId, friend.key, "y", "go");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBeFalsy();

    await recordSwipe(friend.code, friend.memberId, friend.key, "x", "go");
    const state = await partyState(host.code, host.memberId, host.key, 0);
    expect(state.match).toBeTruthy();
    expect(JSON.stringify(state.match)).toContain("x");
  });

  it("doesn't match a room of one", async () => {
    const host = await createParty("Ana", [card("x")]);
    await recordSwipe(host.code, host.memberId, host.key, "x", "go");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBeFalsy();
  });

  it("rejects a wrong member key", async () => {
    const host = await createParty("Ana", [card("x")]);
    await expect(recordSwipe(host.code, host.memberId, "not-the-key", "x", "go")).rejects.toMatchObject({ status: 403 });
  });

  it("caps rooms at 8 members", async () => {
    const { code } = await createOpenParty([card("x"), card("y")]);
    for (let i = 0; i < 8; i++) await joinParty(code, `m${i}`);
    await expect(joinParty(code, "late")).rejects.toBeInstanceOf(PartyError);
  });

  it("ends 10 minutes after creation, even with activity", async () => {
    vi.useFakeTimers();
    const host = await createParty("Ana", [card("x")]);
    vi.advanceTimersByTime(9 * 60_000);
    await partyState(host.code, host.memberId, host.key, 0);
    vi.advanceTimersByTime(60_001);
    await expect(joinParty(host.code, "Ben")).rejects.toMatchObject({ status: 404 });
  });

  it("hands out distinct food names when nobody types one, and lets people rename", async () => {
    const host = await createParty(undefined, [card("x")]);
    const a = await joinParty(host.code);
    const b = await joinParty(host.code);
    expect(new Set([host.nickname, a.nickname, b.nickname]).size).toBe(3);
    await renameMember(a.code, a.memberId, a.key, "Sam");
    const names = (await partyState(host.code, host.memberId, host.key, 0)).members.map((m) => m.nickname);
    expect(names).toContain("Sam");
  });

  it("needs everyone up to 3 people, and all but one from 4", async () => {
    expect([2, 3, 4, 5, 8].map(matchNeeded)).toEqual([2, 3, 3, 4, 7]);
    const host = await createParty(undefined, [card("x")]);
    const others = [await joinParty(host.code), await joinParty(host.code), await joinParty(host.code)];
    for (const m of [host, others[0]]) await recordSwipe(host.code, m.memberId, m.key, "x", "go");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBeNull();
    await recordSwipe(host.code, others[1].memberId, others[1].key, "x", "go");
    const state = await partyState(host.code, host.memberId, host.key, 0);
    expect(state.match).toBe("x");
    // Once there's a result, every vote is shown.
    expect(state.likes.x).toHaveLength(3);
    expect(state.needed).toBe(3);
  });

  it("decides for the group: the most-liked card wins, but only once someone has said go", async () => {
    const host = await createParty(undefined, [card("x"), card("y"), card("z")]);
    const a = await joinParty(host.code);
    const b = await joinParty(host.code);
    await expect(decideNow(host.code, host.memberId, host.key)).rejects.toMatchObject({ status: 409 });
    await recordSwipe(host.code, host.memberId, host.key, "y", "go");
    await recordSwipe(host.code, a.memberId, a.key, "z", "go");
    await recordSwipe(host.code, b.memberId, b.key, "z", "go");
    expect(await decideNow(host.code, a.memberId, a.key)).toEqual({ match: "z" });
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBe("z");
  });

  it("adds 5 minutes once", async () => {
    vi.useFakeTimers();
    const host = await createParty(undefined, [card("x")]);
    const { expiresAt } = await extendParty(host.code, host.memberId, host.key);
    expect(expiresAt - host.expiresAt).toBe(5 * 60_000);
    await expect(extendParty(host.code, host.memberId, host.key)).rejects.toMatchObject({ status: 409 });
    vi.advanceTimersByTime(12 * 60_000);
    expect((await partyState(host.code, host.memberId, host.key, 0)).extended).toBe(true);
  });

  it("shares a nudge as a mood word and where in the deck it starts", async () => {
    const host = await createParty(undefined, [card("x"), card("y")]);
    const a = await joinParty(host.code);
    await steerParty(host.code, a.memberId, a.key, "comfort");
    const { steer } = await partyState(host.code, host.memberId, host.key, 0);
    expect(steer).toEqual({ mood: "comfort", seq: 1, at: 2, by: a.memberId });
    expect(JSON.stringify(steer)).not.toMatch(/craving/);
  });

  it("keeps votes secret until there's a result, but shows you your own", async () => {
    const host = await createParty(undefined, [card("x"), card("y")]);
    const a = await joinParty(host.code);
    const b = await joinParty(host.code);
    await recordSwipe(host.code, a.memberId, a.key, "x", "go");
    await recordSwipe(host.code, b.memberId, b.key, "y", "go");
    const before = await partyState(host.code, a.memberId, a.key, 0);
    expect(before.likes).toEqual({});
    expect(before.myVotes).toEqual(["x"]);
    expect(JSON.stringify(before)).not.toContain(b.memberId + '"]');
    await decideNow(host.code, host.memberId, host.key);
    const after = await partyState(host.code, a.memberId, a.key, 0);
    expect(after.match).toBe("x");
    expect(after.likes).toEqual({ x: [a.memberId], y: [b.memberId] });
  });

  it("drops places that don't fit someone: no votes, no match, no win, and they don't block done", async () => {
    const host = await createParty(undefined, [card("x"), card("y")]);
    const a = await joinParty(host.code);
    await recordSwipe(host.code, host.memberId, host.key, "x", "go");
    await markUnfit(a.code, a.memberId, a.key, ["x"]);
    await recordSwipe(a.code, a.memberId, a.key, "x", "go");
    let state = await partyState(host.code, host.memberId, host.key, 0);
    expect(state.unfit).toEqual(["x"]);
    expect(state.match).toBeNull();
    expect(state.myVotes).toEqual([]);
    expect(state.progress[host.memberId] ?? 0).toBe(0);
    await expect(decideNow(host.code, host.memberId, host.key)).rejects.toMatchObject({ status: 409 });
    await recordSwipe(host.code, host.memberId, host.key, "y", "go");
    expect(await decideNow(host.code, a.memberId, a.key)).toEqual({ match: "y" });
    state = await partyState(host.code, host.memberId, host.key, 0);
    expect(JSON.stringify(state)).not.toMatch(/Vegetarian|allerg/i);
  });

  it("lets anyone add a searched place: marked as added (not by whom), with their vote", async () => {
    const host = await createParty("Ana", [card("x")]);
    const friend = await joinParty(host.code, "Ben");
    const r = await addPlace(friend.code, friend.memberId, friend.key, card("ramen"));
    expect(r).toEqual({ id: "ramen", existed: false });
    const seen = await partyState(host.code, host.memberId, host.key, 0);
    const added = seen.deck.find((c) => c.id === "ramen")!;
    expect(added.added).toBe(true);
    expect(JSON.stringify(added)).not.toContain(friend.memberId);
    expect((await partyState(friend.code, friend.memberId, friend.key, 0)).myVotes).toContain("ramen");
    // The host votes too: with two people, that's a match.
    await recordSwipe(host.code, host.memberId, host.key, "ramen", "go");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBe("ramen");
  });

  it("adding a place that's already in the list just votes for it", async () => {
    const host = await createParty("Ana", [card("x")]);
    const r = await addPlace(host.code, host.memberId, host.key, { ...card("x2"), placeId: "x" });
    expect(r).toEqual({ id: "x", existed: true });
    const s = await partyState(host.code, host.memberId, host.key, 0);
    expect(s.deck).toHaveLength(1);
    expect(s.myVotes).toEqual(["x"]);
  });

  it("takes a vote back when it's changed to a pass", async () => {
    const host = await createParty("Ana", [card("x")]);
    await recordSwipe(host.code, host.memberId, host.key, "x", "go");
    await recordSwipe(host.code, host.memberId, host.key, "x", "skip");
    expect((await partyState(host.code, host.memberId, host.key, 0)).myVotes).toEqual([]);
  });

  it("matches instantly when enough people love the same place, but not on OK alone", async () => {
    const host = await createParty("Ana", [card("x"), card("y"), card("z")]);
    const friend = await joinParty(host.code, "Ben");
    await recordSwipe(host.code, host.memberId, host.key, "x", "ok");
    await recordSwipe(friend.code, friend.memberId, friend.key, "x", "ok");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBeNull();
    await recordSwipe(host.code, host.memberId, host.key, "y", "love");
    await recordSwipe(friend.code, friend.memberId, friend.key, "y", "love");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBe("y");
  });

  it("reveals as soon as everyone has answered every place: most points win (love 2, OK 1)", async () => {
    const host = await createParty("Ana", [card("x"), card("y")]);
    const friend = await joinParty(host.code, "Ben");
    await recordSwipe(host.code, host.memberId, host.key, "x", "love");
    await recordSwipe(host.code, host.memberId, host.key, "y", "ok");
    await recordSwipe(friend.code, friend.memberId, friend.key, "x", "no");
    expect((await partyState(host.code, host.memberId, host.key, 0)).match).toBeNull(); // Ben hasn't answered y yet
    await recordSwipe(friend.code, friend.memberId, friend.key, "y", "ok");
    const s = await partyState(friend.code, friend.memberId, friend.key, 0);
    // x: 2 points but one "Not for me"; y: 2 points and none. Fewer noes breaks the tie.
    expect(s.match).toBe("y");
    expect(s.likes.y.sort()).toEqual([friend.memberId, host.memberId].sort());
    expect(s.loves.x).toEqual([host.memberId]);
  });

  it("lets people change an answer, and shows each person only their own until the reveal", async () => {
    const host = await createParty("Ana", [card("x"), card("y")]);
    const friend = await joinParty(host.code, "Ben");
    await recordSwipe(friend.code, friend.memberId, friend.key, "x", "love");
    await recordSwipe(friend.code, friend.memberId, friend.key, "x", "ok");
    const mine = await partyState(friend.code, friend.memberId, friend.key, 0);
    expect(mine.myAnswers).toEqual({ x: "ok" });
    const theirs = await partyState(host.code, host.memberId, host.key, 0);
    expect(theirs.myAnswers).toEqual({});
    expect(theirs.likes).toEqual({});
    expect(theirs.loves).toEqual({});
  });

  it("keeps wishes anonymous: only a summary, and only food words from the fixed list", async () => {
    const host = await createParty("Ana", [card("x")]);
    const friend = await joinParty(host.code, "Ben");
    await setWishes(host.code, host.memberId, host.key, { price: 3, reach: "drive", crave: ["ramen"] });
    await setWishes(friend.code, friend.memberId, friend.key, { price: 2, reach: "walk", crave: ["ramen", "tacos"] });
    const s = await partyState(host.code, host.memberId, host.key, 0);
    expect(s.wishes).toEqual({ count: 2, price: 2, reach: "walk", crave: ["ramen", "tacos"] });
    expect(JSON.stringify(s)).not.toContain('"price":3');
  });

  it("picks the best place by points, then fewer noes, then list order", () => {
    expect(bestPlace({ a: { love: ["1"], ok: [], no: [] }, b: { love: [], ok: ["1", "2"], no: [] } }, ["a", "b"])).toBe("a");
    expect(bestPlace({ a: { love: [], ok: [], no: ["1"] } }, ["a"])).toBeNull();
  });
});

