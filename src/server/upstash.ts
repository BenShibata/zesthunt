import "server-only";

/**
 * Upstash Redis over REST (pipeline endpoint, no SDK). Shared by party rooms and
 * rate limits. Null when no database is configured, e.g. in local development.
 */

export type UpstashRun = (commands: (string | number)[][]) => Promise<unknown[]>;

export interface Upstash {
  run: UpstashRun;
  /** Used to key the rate-limit hash, so hashes are useless without the database credentials. */
  secret: string;
}

let client: Upstash | null | undefined;

export function upstash(): Upstash | null {
  if (client !== undefined) return client;
  // KV_REST_API_* are the names Vercel's Upstash marketplace integration sets.
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!rawUrl || !token) return (client = null);
  const url = rawUrl.replace(/\/$/, "");

  const run: UpstashRun = async (commands) => {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    if (out.some((r) => r.error)) throw new Error("upstash command failed");
    return out.map((r) => r.result);
  };
  return (client = { run, secret: token });
}

/** For tests: forget the cached client so a changed environment is picked up. */
export function resetUpstashForTests() {
  client = undefined;
}
