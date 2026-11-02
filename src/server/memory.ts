import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { upstash, type Upstash } from "./upstash";

/**
 * Tiny in-memory TTL cache. Lives only as long as the serverless instance, holds
 * restaurant data keyed by ~1 km area, and expires within minutes.
 */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
}

// Salt is random per instance and never persisted, so hashes can't be joined across instances or days.
const SALT = randomBytes(16);

export function hashIp(ip: string): string {
  return createHash("sha256").update(SALT).update(ip).digest("hex").slice(0, 16);
}

const WINDOW_MS = 60_000;
type Counter = { count: number; resetAt: number };
const counters = new TtlCache<Counter>(WINDOW_MS, 5000);
// Separate so a burst of per-IP counters can't evict a daily cap.
const caps = new TtlCache<Counter>(86_400_000, 100);

export interface Limit {
  ok: boolean;
  retryAfter: number;
}

/** Per-instance fixed window. Used locally, and on Vercel only if Upstash is unreachable. */
function localLimit(key: string, limit: number, windowMs = WINDOW_MS, cache = counters): Limit {
  const now = Date.now();
  const entry = cache.get(key);
  if (!entry || entry.resetAt < now) {
    cache.set(key, { count: 1, resetAt: now + windowMs }, windowMs);
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  return { ok: entry.count <= limit, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

/** Counts one hit on a shared Upstash counter that expires on its own. Returns the new count. */
async function sharedCount(db: Upstash, key: string, ttlSeconds: number): Promise<number> {
  const [, count] = await db.run([
    ["SET", key, 0, "EX", ttlSeconds, "NX"],
    ["INCR", key],
  ]);
  return Number(count);
}

/**
 * Fixed one-minute window per client IP, per bucket. With Upstash the count is shared
 * by every server instance. The key is an HMAC of the IP and the minute, so it can't be
 * linked to an IP without the database credentials, or to the same IP a minute later.
 * Counters expire after two minutes.
 */
export async function rateLimit(ip: string, bucket = "picks", limit = 40): Promise<Limit> {
  const now = Date.now();
  const window = Math.floor(now / WINDOW_MS);
  const retryAfter = Math.ceil(((window + 1) * WINDOW_MS - now) / 1000);
  const db = upstash();
  if (db) {
    try {
      const id = createHmac("sha256", db.secret).update(`${window}:${ip}`).digest("hex").slice(0, 24);
      const count = await sharedCount(db, `zh:rl:${bucket}:${window}:${id}`, 120);
      return { ok: count <= limit, retryAfter: count <= limit ? 0 : retryAfter };
    } catch (e) {
      console.error("rate limit fallback:", safeErrorLabel(e));
    }
  }
  return localLimit(`${bucket}:${hashIp(ip)}`, limit);
}

/**
 * A ceiling on total calls per UTC day for a bucket, across all users. It caps what an
 * open endpoint (like /mcp) can spend on paid APIs, whoever is calling.
 */
export async function dailyLimit(bucket: string, limit: number): Promise<Limit> {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const retryAfter = Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000);
  const db = upstash();
  if (db) {
    try {
      const count = await sharedCount(db, `zh:cap:${bucket}:${day}`, 2 * 86_400);
      return { ok: count <= limit, retryAfter: count <= limit ? 0 : retryAfter };
    } catch (e) {
      console.error("daily limit fallback:", safeErrorLabel(e));
    }
  }
  return localLimit(`${bucket}:${day}`, limit, retryAfter * 1000, caps);
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * What may reach server logs about a failure: our own "service status" strings
 * (e.g. "places 403") or just the error type. Never messages that could echo a
 * request, a prompt, coordinates or a URL with a key in it.
 */
export function safeErrorLabel(e: unknown): string {
  if (e instanceof Error && /^(places|routes|geocode|upstash) \d{3}$/.test(e.message)) return e.message;
  return e instanceof Error ? e.name : "unknown";
}
