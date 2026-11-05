import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MAX_DECK, MAX_MEMBERS, ROOM_TTL_MS, roomStore, type StoredMember } from "./partyStore";
import type { Mood, PartyCard, PartyState } from "@/lib/types";

/** Friendly names handed out on join, so nobody has to fill in a form. Tap to rename. */
const FOOD_NAMES = ["Taco", "Ramen", "Dumpling", "Mango", "Biscuit", "Noodle", "Pickle", "Waffle", "Mochi", "Falafel", "Churro", "Kimchi", "Bao", "Pretzel"];

export function pickName(taken: string[]): string {
  const free = FOOD_NAMES.filter((n) => !taken.includes(n));
  return free.length > 0 ? free[randomInt(free.length)] : `Guest ${taken.length + 1}`;
}

/** "Go"s needed for a match: everyone in groups of up to 3, all but one in bigger groups (so one holdout can't stall it). */
export function matchNeeded(members: number): number {
  return members <= 3 ? members : members - 1;
}

const EXTEND_MS = 5 * 60_000;

// No 0/O/1/I/L so codes are easy to read out loud.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

function newCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const NicknameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20))
  .pipe(z.string().min(1));

const UrlPhoto = z.object({ kind: z.literal("url"), url: z.string().max(600).startsWith("/api/photo?"), attribution: z.string().max(80).optional() });

/** Restaurant card as the client sends it. Anything extra is dropped by Zod. */
export const PartyCardSchema = z.object({
  id: z.string().max(200),
  placeId: z.string().max(200),
  name: z.string().max(120),
  suggestion: z.string().max(120),
  reason: z.string().max(160),
  moods: z.array(z.string().max(12)).max(5),
  category: z.string().max(40).nullable(),
  priceLevel: z.number().int().min(1).max(4).nullable(),
  closesAt: z.string().max(40).nullable(),
  travelMode: z.enum(["walk", "drive"]),
  location: z.object({ lat: z.number(), lng: z.number() }),
  address: z.string().max(160),
  payment: z
    .object({
      acceptsCreditCards: z.boolean().optional(),
      acceptsDebitCards: z.boolean().optional(),
      acceptsCashOnly: z.boolean().optional(),
      acceptsNfc: z.boolean().optional(),
    })
    .nullable(),
  websiteUrl: z.string().max(500).optional(),
  about: z.string().max(400).optional(),
  orderUrl: z.string().max(500).optional(),
  takeout: z.boolean().nullable().optional(),
  delivery: z.boolean().nullable().optional(),
  plate: z.object({ protein: z.number(), veg: z.number(), grain: z.number() }),
  labels: z.array(z.enum(["Protein", "Veg", "Whole grain"])).max(3),
  balance: z.number(),
  upgradeTip: z.string().max(160).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  ratingCount: z.number().int().min(0).nullable().optional(),
  mapsUrl: z.string().max(500).startsWith("https://").optional(),
  vegetarianOptions: z.boolean().nullable().optional(),
  placeTypes: z.array(z.string().max(40)).max(8).optional(),
  photo: z.union([UrlPhoto, z.object({ kind: z.literal("mock"), palette: z.tuple([z.string(), z.string(), z.string()]), motif: z.enum(["bowl", "plate", "wrap", "cup"]) })]),
  photos: z.array(UrlPhoto).max(5).optional(),
  storefront: UrlPhoto.optional(),
  phone: z.string().max(40).optional(),
  phoneDial: z.string().max(20).regex(/^\+?\d+$/).optional(),
  reservable: z.boolean().nullable().optional(),
  added: z.boolean().optional(),
});

export class PartyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function newMember(nickname: string): { member: StoredMember; key: string } {
  const key = randomBytes(18).toString("base64url");
  return { member: { id: randomBytes(6).toString("hex"), nickname, keyHash: hashKey(key) }, key };
}

async function liveMeta(code: string) {
  const meta = await roomStore().meta(code);
  if (!meta || meta.expiresAt <= Date.now()) throw new PartyError(404, "This party has ended.");
  return meta;
}

async function authed(code: string, memberId: string, key: string) {
  const meta = await liveMeta(code);
  const member = (await roomStore().members(code)).find((m) => m.id === memberId);
  const a = Buffer.from(member?.keyHash ?? "");
  const b = Buffer.from(hashKey(key));
  if (!member || a.length !== b.length || !timingSafeEqual(a, b)) throw new PartyError(403, "Not in this party.");
  return { meta, member };
}

export async function createParty(nickname: string | undefined, cards: PartyCard[]) {
  const store = roomStore();
  const expiresAt = Date.now() + ROOM_TTL_MS;
  const name = nickname ?? pickName([]);
  const { member, key } = newMember(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await store.create(code, { hostId: member.id, expiresAt }, member)) {
      await store.appendDeck(code, cards.slice(0, MAX_DECK).map((c) => JSON.stringify(c)), expiresAt);
      return { code, memberId: member.id, key, expiresAt, nickname: name };
    }
  }
  throw new PartyError(503, "Couldn't open a room. Try again.");
}

/** An open room with no host, for the AI connector: friends join from the link, and 2+ "go" swipes make a match. */
export async function createOpenParty(cards: PartyCard[]) {
  const store = roomStore();
  const expiresAt = Date.now() + ROOM_TTL_MS;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await store.create(code, { hostId: null, expiresAt }, null)) {
      await store.appendDeck(code, cards.slice(0, MAX_DECK).map((c) => JSON.stringify(c)), expiresAt);
      return { code, expiresAt };
    }
  }
  throw new PartyError(503, "Couldn't open a room. Try again.");
}

export async function joinParty(code: string, nickname?: string) {
  const meta = await liveMeta(code);
  const members = await roomStore().members(code);
  if (members.length >= MAX_MEMBERS) throw new PartyError(409, "This party is full.");
  const name = nickname ?? pickName(members.map((m) => m.nickname));
  const { member, key } = newMember(name);
  await roomStore().addMember(code, member, meta.expiresAt);
  return { code, memberId: member.id, key, expiresAt: meta.expiresAt, nickname: name };
}

export async function renameMember(code: string, memberId: string, key: string, nickname: string) {
  const { meta, member } = await authed(code, memberId, key);
  await roomStore().addMember(code, { ...member, nickname }, meta.expiresAt);
  return { nickname };
}

export async function addCards(code: string, memberId: string, key: string, cards: PartyCard[]) {
  const { meta } = await authed(code, memberId, key);
  if (meta.hostId !== memberId) throw new PartyError(403, "Only the host adds picks.");
  const { size } = await roomStore().deck(code, 0);
  const room = Math.max(0, MAX_DECK - size);
  return roomStore().appendDeck(code, cards.slice(0, room).map((c) => JSON.stringify(c)), meta.expiresAt);
}

/**
 * Anyone can add a place they searched for: it goes to the end of everyone's list, marked as
 * added (never by whom), and counts as their vote. A place already in the list just gets the vote.
 */
export async function addPlace(code: string, memberId: string, key: string, card: PartyCard) {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const deck = await store.deck(code, 0);
  const existing = deck.cards.map((c) => JSON.parse(c) as PartyCard).find((c) => c.placeId === card.placeId);
  let id = existing?.id;
  if (!id) {
    if (deck.size >= MAX_DECK) throw new PartyError(409, "The list is full. Vote on what's there.");
    await store.appendDeck(code, [JSON.stringify({ ...card, added: true })], meta.expiresAt);
    id = card.id;
  }
  await recordSwipe(code, memberId, key, id, "go");
  return { id, existed: Boolean(existing) };
}

/** Who said go to each card. */
function likesFrom(swipes: Record<string, "go" | "skip">, memberIds: string[], unfit: string[] = []): Record<string, string[]> {
  const likes: Record<string, string[]> = {};
  for (const [k, dir] of Object.entries(swipes)) {
    const [member, pickId] = k.split("|");
    // A place that doesn't fit someone can't win, however many votes it had.
    if (dir === "go" && memberIds.includes(member) && !unfit.includes(pickId)) (likes[pickId] ??= []).push(member);
  }
  return likes;
}

/**
 * "Doesn't fit someone": each phone checks the cards against its own needs (and whether
 * there's time to get there) and reports only the card ids. The room never learns who or why.
 */
export async function markUnfit(code: string, memberId: string, key: string, pickIds: string[]) {
  const { meta } = await authed(code, memberId, key);
  await roomStore().addUnfit(code, pickIds, meta.expiresAt);
}

/** Records a swipe, then checks for a match: a pick enough members (2+) swiped right on. */
export async function recordSwipe(code: string, memberId: string, key: string, pickId: string, dir: "go" | "skip") {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  await store.swipe(code, memberId, pickId, dir, meta.expiresAt);
  if (dir !== "go") return;
  const [members, swipes, unfit] = await Promise.all([store.members(code), store.swipes(code), store.unfit(code)]);
  const goes = likesFrom(swipes, members.map((m) => m.id), unfit)[pickId]?.length ?? 0;
  if (members.length >= 2 && goes >= matchNeeded(members.length)) {
    await store.setMatch(code, pickId, meta.expiresAt);
  }
}

/** "Reveal results": the most-liked card wins (earliest in the deck breaks ties) and every vote is shown. Needs at least one "I'm in". */
export async function decideNow(code: string, memberId: string, key: string) {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, swipes, deck, unfit] = await Promise.all([store.members(code), store.swipes(code), store.deck(code, 0), store.unfit(code)]);
  const likes = likesFrom(swipes, members.map((m) => m.id), unfit);
  const order = deck.cards.map((c) => (JSON.parse(c) as PartyCard).id);
  let best: string | null = null;
  for (const id of order) if ((likes[id]?.length ?? 0) > (best ? likes[best].length : 0)) best = id;
  if (!best) throw new PartyError(409, "Nobody's said I'm in to anything yet. Keep voting!");
  await store.setMatch(code, best, meta.expiresAt);
  return { match: best };
}

/** "+5 minutes", once per room. */
export async function extendParty(code: string, memberId: string, key: string) {
  const { meta } = await authed(code, memberId, key);
  if (meta.extended) throw new PartyError(409, "This party already got its extra 5 minutes.");
  const next = { ...meta, extended: true, expiresAt: meta.expiresAt + EXTEND_MS };
  await roomStore().updateMeta(code, next);
  return { expiresAt: next.expiresAt };
}

/** A group nudge ("Heartier"). Only the mood word is stored; the host's phone fetches matching cards. */
export async function steerParty(code: string, memberId: string, key: string, mood: Mood) {
  const { meta } = await authed(code, memberId, key);
  const { size } = await roomStore().deck(code, 0);
  const steer = { mood, seq: (meta.steer?.seq ?? 0) + 1, at: size, by: memberId };
  await roomStore().updateMeta(code, { ...meta, steer });
  return { steer };
}

export async function partyState(code: string, memberId: string, key: string, since: number): Promise<PartyState> {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, deck, swipes, match, unfit] = await Promise.all([
    store.members(code),
    store.deck(code, since),
    store.swipes(code),
    store.match(code),
    store.unfit(code),
  ]);
  const allLikes = likesFrom(swipes, members.map((m) => m.id), unfit);
  // Progress counts votes on places still in play, so removed ones don't block "done".
  const progress: Record<string, number> = {};
  for (const k of Object.keys(swipes)) {
    const [id, pickId] = k.split("|");
    if (!unfit.includes(pickId)) progress[id] = (progress[id] ?? 0) + 1;
  }
  return {
    code,
    hostId: meta.hostId,
    expiresAt: meta.expiresAt,
    members: members.map(({ id, nickname }) => ({ id, nickname })),
    deck: deck.cards.map((c) => JSON.parse(c) as PartyCard),
    deckSize: deck.size,
    progress,
    match,
    // Secret ballot: other people's votes only leave the server once there's a result.
    likes: match ? allLikes : {},
    myVotes: Object.keys(allLikes).filter((id) => allLikes[id].includes(memberId)),
    needed: matchNeeded(Math.max(2, members.length)),
    extended: Boolean(meta.extended),
    steer: meta.steer ?? null,
    unfit,
  };
}
