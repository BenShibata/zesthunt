import "server-only";
import { createHash, randomBytes } from "node:crypto";

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

  set(key: string, value: V) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

// Salt is random per instance and never persisted, so hashes can't be joined across instances or days.
const SALT = randomBytes(16);

export function hashIp(ip: string): string {
  return createHash("sha256").update(SALT).update(ip).digest("hex").slice(0, 16);
}

const WINDOW_MS = 60_000;
const counters = new TtlCache<{ count: number; resetAt: number }>(WINDOW_MS, 5000);

/** Fixed-window limiter on hashed IPs, per bucket. Counters vanish after a minute. */
export function rateLimit(ip: string, bucket = "picks", limit = 40): { ok: boolean; retryAfter: number } {
  const key = `${bucket}:${hashIp(ip)}`;
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || entry.resetAt < now) {
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  return { ok: entry.count <= limit, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
