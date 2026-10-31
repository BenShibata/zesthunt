import "server-only";

/**
 * Party rooms: the only server-side state in Zesthunt.
 *
 * A room holds exactly: its code, member nicknames (with a hashed join key), the
 * shared deck of restaurant cards, swipes, and the match. Never location, prompts
 * or cravings. Every key expires at the same absolute time, 10 minutes after the
 * room was created (a hard TTL that activity does not extend).
 *
 * Backends: Upstash Redis over REST when UPSTASH_REDIS_REST_URL/TOKEN are set
 * (needed on Vercel, where instances don't share memory), else in-process memory
 * for local development.
 */

export const ROOM_TTL_MS = 10 * 60_000;
export const MAX_MEMBERS = 8;
export const MAX_DECK = 40;

export interface StoredMember {
  id: string;
  nickname: string;
  keyHash: string;
}

export interface RoomMeta {
  hostId: string;
  expiresAt: number;
}

export interface RoomStore {
  /** Creates the room only if the code is free. */
  create(code: string, meta: RoomMeta, host: StoredMember): Promise<boolean>;
  meta(code: string): Promise<RoomMeta | null>;
  addMember(code: string, m: StoredMember, expiresAt: number): Promise<void>;
  members(code: string): Promise<StoredMember[]>;
  appendDeck(code: string, cardsJson: string[], expiresAt: number): Promise<number>;
  deck(code: string, since: number): Promise<{ cards: string[]; size: number }>;
  swipe(code: string, memberId: string, pickId: string, dir: "go" | "skip", expiresAt: number): Promise<void>;
  swipes(code: string): Promise<Record<string, "go" | "skip">>;
  /** Sets the match once; later calls keep the first. */
  setMatch(code: string, pickId: string, expiresAt: number): Promise<void>;
  match(code: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// In-memory backend (local dev, single instance)
// ---------------------------------------------------------------------------

interface MemRoom {
  meta: RoomMeta;
  members: Map<string, StoredMember>;
  deck: string[];
  swipes: Map<string, "go" | "skip">;
  match: string | null;
}

class MemoryStore implements RoomStore {
  private rooms = new Map<string, MemRoom>();

  private get(code: string): MemRoom | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.meta.expiresAt <= Date.now()) {
      this.rooms.delete(code);
      return null;
    }
    return room;
  }

  private sweep() {
    for (const [code, room] of this.rooms) if (room.meta.expiresAt <= Date.now()) this.rooms.delete(code);
  }

  async create(code: string, meta: RoomMeta, host: StoredMember) {
    this.sweep();
    if (this.get(code)) return false;
    this.rooms.set(code, { meta, members: new Map([[host.id, host]]), deck: [], swipes: new Map(), match: null });
    return true;
  }
  async meta(code: string) {
    return this.get(code)?.meta ?? null;
  }
  async addMember(code: string, m: StoredMember) {
    this.get(code)?.members.set(m.id, m);
  }
  async members(code: string) {
    return [...(this.get(code)?.members.values() ?? [])];
  }
  async appendDeck(code: string, cards: string[]) {
    const room = this.get(code);
    if (!room) return 0;
    room.deck.push(...cards);
    return room.deck.length;
  }
  async deck(code: string, since: number) {
    const deck = this.get(code)?.deck ?? [];
    return { cards: deck.slice(since), size: deck.length };
  }
  async swipe(code: string, memberId: string, pickId: string, dir: "go" | "skip") {
    this.get(code)?.swipes.set(`${memberId}|${pickId}`, dir);
  }
  async swipes(code: string) {
    return Object.fromEntries(this.get(code)?.swipes ?? []);
  }
  async setMatch(code: string, pickId: string) {
    const room = this.get(code);
    if (room && !room.match) room.match = pickId;
  }
  async match(code: string) {
    return this.get(code)?.match ?? null;
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis backend (REST pipeline, no SDK needed)
// ---------------------------------------------------------------------------

class UpstashStore implements RoomStore {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async run(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const failed = out.find((r) => r.error);
    if (failed) throw new Error("upstash command failed");
    return out.map((r) => r.result);
  }

  private k(code: string, part: string) {
    return `zh:room:${code}:${part}`;
  }

  private expire(code: string, expiresAt: number, ...parts: string[]) {
    const at = Math.ceil(expiresAt / 1000);
    return parts.map((p) => ["EXPIREAT", this.k(code, p), at]);
  }

  async create(code: string, meta: RoomMeta, host: StoredMember) {
    const ttl = Math.max(1, Math.ceil((meta.expiresAt - Date.now()) / 1000));
    const [ok] = await this.run([["SET", this.k(code, "meta"), JSON.stringify(meta), "NX", "EX", ttl]]);
    if (ok !== "OK") return false;
    await this.run([["HSET", this.k(code, "members"), host.id, JSON.stringify(host)], ...this.expire(code, meta.expiresAt, "members")]);
    return true;
  }
  async meta(code: string) {
    const [raw] = await this.run([["GET", this.k(code, "meta")]]);
    return typeof raw === "string" ? (JSON.parse(raw) as RoomMeta) : null;
  }
  async addMember(code: string, m: StoredMember, expiresAt: number) {
    await this.run([["HSET", this.k(code, "members"), m.id, JSON.stringify(m)], ...this.expire(code, expiresAt, "members")]);
  }
  async members(code: string) {
    const [raw] = await this.run([["HVALS", this.k(code, "members")]]);
    return ((raw as string[] | null) ?? []).map((s) => JSON.parse(s) as StoredMember);
  }
  async appendDeck(code: string, cards: string[], expiresAt: number) {
    if (cards.length === 0) return 0;
    const [size] = await this.run([["RPUSH", this.k(code, "deck"), ...cards], ...this.expire(code, expiresAt, "deck")]);
    return Number(size);
  }
  async deck(code: string, since: number) {
    const [cards, size] = await this.run([
      ["LRANGE", this.k(code, "deck"), since, -1],
      ["LLEN", this.k(code, "deck")],
    ]);
    return { cards: (cards as string[] | null) ?? [], size: Number(size ?? 0) };
  }
  async swipe(code: string, memberId: string, pickId: string, dir: "go" | "skip", expiresAt: number) {
    await this.run([["HSET", this.k(code, "swipes"), `${memberId}|${pickId}`, dir], ...this.expire(code, expiresAt, "swipes")]);
  }
  async swipes(code: string) {
    const [raw] = await this.run([["HGETALL", this.k(code, "swipes")]]);
    const flat = (raw as string[] | null) ?? [];
    const out: Record<string, "go" | "skip"> = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1] as "go" | "skip";
    return out;
  }
  async setMatch(code: string, pickId: string, expiresAt: number) {
    const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    await this.run([["SET", this.k(code, "match"), pickId, "NX", "EX", ttl]]);
  }
  async match(code: string) {
    const [raw] = await this.run([["GET", this.k(code, "match")]]);
    return typeof raw === "string" ? raw : null;
  }
}

let store: RoomStore | null = null;

export function roomStore(): RoomStore {
  if (store) return store;
  // KV_REST_API_* are the names Vercel's Upstash marketplace integration sets.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  store = url && token ? new UpstashStore(url.replace(/\/$/, ""), token) : new MemoryStore();
  return store;
}
