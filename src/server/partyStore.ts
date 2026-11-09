import "server-only";
import { upstash, type UpstashRun } from "./upstash";
import type { PartySteer } from "@/lib/types";

/**
 * Party rooms: the only server-side state in Zesthunt.
 *
 * A room holds exactly: its code, member nicknames (with a hashed join key), the
 * shared deck of restaurant cards, answers, each member's wishes (budget, distance and food
 * words from a fixed list; only a nameless summary ever leaves the server), and the match.
 * Never location, prompts or typed text. Every key expires at the same absolute time, 10 minutes after the
 * room was created (a hard TTL that activity does not extend).
 *
 * Backends: Upstash Redis over REST when UPSTASH_REDIS_REST_URL/TOKEN are set
 * (needed on Vercel, where instances don't share memory), else in-process memory
 * for local development.
 */

export const ROOM_TTL_MS = 10 * 60_000;

/** A member's answer to a place. "go" and "skip" are the older yes/no, still accepted. */
export type Answer = "love" | "ok" | "no" | "go" | "skip";
export const MAX_MEMBERS = 8;
export const MAX_DECK = 40;

export interface StoredMember {
  id: string;
  nickname: string;
  keyHash: string;
}

export interface RoomMeta {
  /** Null for an open room started from an AI assistant: no host, everyone joins by link. */
  hostId: string | null;
  expiresAt: number;
  /** The one-time "+5 minutes" was used. */
  extended?: boolean;
  /** Latest group nudge: a mood word only, never typed text. */
  steer?: PartySteer;
}

export interface RoomStore {
  /** Creates the room only if the code is free. */
  create(code: string, meta: RoomMeta, host: StoredMember | null): Promise<boolean>;
  meta(code: string): Promise<RoomMeta | null>;
  /** Replaces the meta and moves every key's expiry to meta.expiresAt (used by "+5 minutes" and nudges). */
  updateMeta(code: string, meta: RoomMeta): Promise<void>;
  addMember(code: string, m: StoredMember, expiresAt: number): Promise<void>;
  members(code: string): Promise<StoredMember[]>;
  appendDeck(code: string, cardsJson: string[], expiresAt: number): Promise<number>;
  deck(code: string, since: number): Promise<{ cards: string[]; size: number }>;
  swipe(code: string, memberId: string, pickId: string, dir: Answer, expiresAt: number): Promise<void>;
  swipes(code: string): Promise<Record<string, Answer>>;
  /** One member's wishes, as JSON. */
  setWish(code: string, memberId: string, json: string, expiresAt: number): Promise<void>;
  wishes(code: string): Promise<Record<string, string>>;
  /** Cards that don't fit someone in the room (no who, no why). */
  addUnfit(code: string, pickIds: string[], expiresAt: number): Promise<void>;
  unfit(code: string): Promise<string[]>;
  /** Sets the match once; later calls keep the first. */
  setMatch(code: string, pickId: string, expiresAt: number): Promise<void>;
  match(code: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// In-memory backend (local dev, single instance)
// ---------------------------------------------------------------------------

interface MemRoom {
  unfit: Set<string>;
  meta: RoomMeta;
  members: Map<string, StoredMember>;
  deck: string[];
  swipes: Map<string, Answer>;
  wishes: Map<string, string>;
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

  async create(code: string, meta: RoomMeta, host: StoredMember | null) {
    this.sweep();
    if (this.get(code)) return false;
    this.rooms.set(code, { meta, members: new Map(host ? [[host.id, host]] : []), deck: [], swipes: new Map(), wishes: new Map(), match: null, unfit: new Set() });
    return true;
  }
  async meta(code: string) {
    return this.get(code)?.meta ?? null;
  }
  async updateMeta(code: string, meta: RoomMeta) {
    const room = this.get(code);
    if (room) room.meta = meta;
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
  async swipe(code: string, memberId: string, pickId: string, dir: Answer) {
    this.get(code)?.swipes.set(`${memberId}|${pickId}`, dir);
  }
  async swipes(code: string) {
    return Object.fromEntries(this.get(code)?.swipes ?? []);
  }
  async setWish(code: string, memberId: string, json: string) {
    this.get(code)?.wishes.set(memberId, json);
  }
  async wishes(code: string) {
    return Object.fromEntries(this.get(code)?.wishes ?? []);
  }
  async addUnfit(code: string, pickIds: string[]) {
    const room = this.get(code);
    for (const id of pickIds) room?.unfit.add(id);
  }
  async unfit(code: string) {
    return [...(this.get(code)?.unfit ?? [])];
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
// Upstash Redis backend (see ./upstash)
// ---------------------------------------------------------------------------

class UpstashStore implements RoomStore {
  constructor(private run: UpstashRun) {}

  private k(code: string, part: string) {
    return `zh:room:${code}:${part}`;
  }

  private expire(code: string, expiresAt: number, ...parts: string[]) {
    const at = Math.ceil(expiresAt / 1000);
    return parts.map((p) => ["EXPIREAT", this.k(code, p), at]);
  }

  async create(code: string, meta: RoomMeta, host: StoredMember | null) {
    const ttl = Math.max(1, Math.ceil((meta.expiresAt - Date.now()) / 1000));
    const [ok] = await this.run([["SET", this.k(code, "meta"), JSON.stringify(meta), "NX", "EX", ttl]]);
    if (ok !== "OK") return false;
    if (host) await this.run([["HSET", this.k(code, "members"), host.id, JSON.stringify(host)], ...this.expire(code, meta.expiresAt, "members")]);
    return true;
  }
  async meta(code: string) {
    const [raw] = await this.run([["GET", this.k(code, "meta")]]);
    return typeof raw === "string" ? (JSON.parse(raw) as RoomMeta) : null;
  }
  async updateMeta(code: string, meta: RoomMeta) {
    const ttl = Math.max(1, Math.ceil((meta.expiresAt - Date.now()) / 1000));
    await this.run([
      ["SET", this.k(code, "meta"), JSON.stringify(meta), "XX", "EX", ttl],
      ...this.expire(code, meta.expiresAt, "members", "deck", "swipes", "wishes", "match", "unfit"),
    ]);
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
  async swipe(code: string, memberId: string, pickId: string, dir: Answer, expiresAt: number) {
    await this.run([["HSET", this.k(code, "swipes"), `${memberId}|${pickId}`, dir], ...this.expire(code, expiresAt, "swipes")]);
  }
  async swipes(code: string) {
    const [raw] = await this.run([["HGETALL", this.k(code, "swipes")]]);
    const flat = (raw as string[] | null) ?? [];
    const out: Record<string, Answer> = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1] as Answer;
    return out;
  }
  async setWish(code: string, memberId: string, json: string, expiresAt: number) {
    await this.run([["HSET", this.k(code, "wishes"), memberId, json], ...this.expire(code, expiresAt, "wishes")]);
  }
  async wishes(code: string) {
    const [raw] = await this.run([["HGETALL", this.k(code, "wishes")]]);
    const flat = (raw as string[] | null) ?? [];
    const out: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  }
  async addUnfit(code: string, pickIds: string[], expiresAt: number) {
    if (pickIds.length === 0) return;
    await this.run([["SADD", this.k(code, "unfit"), ...pickIds], ...this.expire(code, expiresAt, "unfit")]);
  }
  async unfit(code: string) {
    const [raw] = await this.run([["SMEMBERS", this.k(code, "unfit")]]);
    return (raw as string[] | null) ?? [];
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
  const db = upstash();
  store = db ? new UpstashStore(db.run) : new MemoryStore();
  return store;
}

/** For tests: drop the cached store (and its rooms). */
export function resetRoomStoreForTests() {
  store = null;
}
