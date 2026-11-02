import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyCard } from "@/lib/types";
import { resetUpstashForTests } from "./upstash";
import { resetRoomStoreForTests } from "./partyStore";
import { createOpenParty, createParty, joinParty, partyState, PartyError, recordSwipe } from "./party";

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
});
