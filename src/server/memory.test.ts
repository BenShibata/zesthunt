import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetUpstashForTests } from "./upstash";
import { dailyLimit, rateLimit } from "./memory";

const DB_VARS = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];

beforeEach(() => {
  for (const k of DB_VARS) vi.stubEnv(k, "");
  resetUpstashForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit without a database", () => {
  it("allows the limit, then blocks until the window resets", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) expect((await rateLimit("10.0.0.1", "t1", 3)).ok).toBe(true);
    const blocked = await rateLimit("10.0.0.1", "t1", 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect((await rateLimit("10.0.0.2", "t1", 3)).ok).toBe(true);
    expect((await rateLimit("10.0.0.1", "t2", 3)).ok).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect((await rateLimit("10.0.0.1", "t1", 3)).ok).toBe(true);
  });
});

describe("dailyLimit without a database", () => {
  it("keeps counting past a minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    expect((await dailyLimit("d1", 2)).ok).toBe(true);
    vi.advanceTimersByTime(5 * 60_000);
    expect((await dailyLimit("d1", 2)).ok).toBe(true);
    expect((await dailyLimit("d1", 2)).ok).toBe(false);
    vi.setSystemTime(new Date("2026-11-03T00:00:01Z"));
    expect((await dailyLimit("d1", 2)).ok).toBe(true);
  });
});

describe("with Upstash", () => {
  const counts = new Map<string, number>();
  let bodies: string[] = [];

  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://db.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret");
    resetUpstashForTests();
    counts.clear();
    bodies = [];
    // A tiny Redis: SET … NX then INCR.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        const cmds = JSON.parse(String(init.body)) as (string | number)[][];
        const out = cmds.map(([cmd, key]) => {
          if (cmd === "SET") return { result: counts.has(String(key)) ? null : (counts.set(String(key), 0), "OK") };
          const n = (counts.get(String(key)) ?? 0) + 1;
          counts.set(String(key), n);
          return { result: n };
        });
        return new Response(JSON.stringify(out));
      }),
    );
  });

  it("shares one counter and never puts the IP in the key", async () => {
    for (let i = 0; i < 2; i++) expect((await rateLimit("203.0.113.9", "u1", 2)).ok).toBe(true);
    expect((await rateLimit("203.0.113.9", "u1", 2)).ok).toBe(false);
    expect(bodies.join()).not.toContain("203.0.113.9");
    expect([...counts.keys()].every((k) => k.startsWith("zh:rl:u1:"))).toBe(true);
  });

  it("falls back to local counting if the database is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    for (let i = 0; i < 2; i++) expect((await rateLimit("203.0.113.10", "u2", 2)).ok).toBe(true);
    expect((await rateLimit("203.0.113.10", "u2", 2)).ok).toBe(false);
  });

  it("keeps a daily cap in one shared key per day", async () => {
    expect((await dailyLimit("u3", 1)).ok).toBe(true);
    expect((await dailyLimit("u3", 1)).ok).toBe(false);
    expect([...counts.keys()]).toEqual([`zh:cap:u3:${new Date().toISOString().slice(0, 10)}`]);
  });
});
