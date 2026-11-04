import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyCard } from "@/lib/types";
import { resetUpstashForTests } from "./upstash";
import { resetRoomStoreForTests } from "./partyStore";
import { createOpenParty, createParty, decideNow, extendParty, joinParty, markUnfit, matchNeeded, partyState, PartyError, recordSwipe, renameMember, steerParty } from "./party";

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
});
